"""scope clients and materials to a business and enable row-level security

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-11
"""

import sqlalchemy as sa
from alembic import op
from backend.rls import BUSINESS_ID_DEFAULT, apply_rls
from sqlalchemy.dialects import postgresql

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

_TABLES = ("clients", "materials_rates")


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    for table in _TABLES:
        cols = {c["name"] for c in inspector.get_columns(table)}
        if "business_id" not in cols:
            op.add_column(
                table,
                sa.Column(
                    "business_id",
                    postgresql.UUID(as_uuid=True),
                    sa.ForeignKey("businesses.id", ondelete="CASCADE"),
                    nullable=True,
                ),
            )
            op.create_index(f"ix_{table}_business_id", table, ["business_id"])
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN business_id "
            f"SET DEFAULT {BUSINESS_ID_DEFAULT}"
        )

    # Existing clients belong to the business of their assigned designer.
    op.execute(
        """
        UPDATE clients c SET business_id = u.business_id
        FROM users u
        WHERE c.assigned_designer_id = u.id
          AND c.business_id IS NULL
          AND u.business_id IS NOT NULL
        """
    )

    apply_rls(conn)


def downgrade() -> None:
    for table in (
        "quotation_line_items",
        "agent_audit_log",
        "quotations",
        "final_summaries",
        "designs",
        "checkpoints",
        *_TABLES,
    ):
        op.execute(f"DROP POLICY IF EXISTS business_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    for table in _TABLES:
        op.drop_index(f"ix_{table}_business_id", table_name=table)
        op.drop_column(table, "business_id")
