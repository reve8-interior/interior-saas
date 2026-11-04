"""designs carry business_id so they can exist without a client

Revision ID: 0051
Revises: 0050
Create Date: 2026-11-02
"""

import sqlalchemy as sa
from alembic import op
from backend.rls import BUSINESS_ID_DEFAULT, apply_rls
from sqlalchemy.dialects import postgresql

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None

_LEGACY_PREDICATE = "EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id)"


def upgrade() -> None:
    op.add_column(
        "designs",
        sa.Column(
            "business_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.execute(
        """
        UPDATE designs d SET business_id = c.business_id
        FROM clients c
        WHERE d.client_id = c.id AND d.business_id IS NULL
        """
    )
    # Designs of clients with no business keep business_id NULL: no data is
    # dropped, and RLS keeps those rows invisible to every business.
    op.execute(
        "ALTER TABLE designs ALTER COLUMN business_id "
        f"SET DEFAULT {BUSINESS_ID_DEFAULT}"
    )
    op.alter_column(
        "designs", "client_id", existing_nullable=False, nullable=True
    )
    op.create_index("ix_designs_business_id", "designs", ["business_id"])
    # Recreates the designs policy on business_id.
    apply_rls(op.get_bind())


def downgrade() -> None:
    # Client-less designs cannot go back to a NOT NULL client_id; refuse
    # rather than delete them.
    clientless = (
        op.get_bind()
        .exec_driver_sql(
            "SELECT count(*) FROM designs WHERE client_id IS NULL"
        )
        .scalar()
    )
    if clientless:
        raise RuntimeError(
            f"{clientless} designs have no client; reassign or remove them "
            "before downgrading below 0051"
        )
    op.alter_column(
        "designs", "client_id", existing_nullable=True, nullable=False
    )
    op.execute("DROP POLICY IF EXISTS business_isolation ON designs")
    op.execute(
        "CREATE POLICY business_isolation ON designs TO portal_app "
        f"USING ({_LEGACY_PREDICATE}) WITH CHECK ({_LEGACY_PREDICATE})"
    )
    op.drop_index("ix_designs_business_id", table_name="designs")
    op.drop_column("designs", "business_id")
