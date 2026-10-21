"""add businesses table, users.business_id and superadmin role

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-10
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD VALUE cannot run inside a transaction block on older Postgres.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'superadmin'")

    # Idempotent: init_db() may have already created the table via create_all().
    inspector = sa.inspect(op.get_bind())

    if not inspector.has_table("businesses"):
        op.create_table(
            "businesses",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("contact_email", sa.String(255)),
            sa.Column("contact_phone", sa.String(50)),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.Column("updated_at", sa.DateTime(timezone=True)),
        )
        op.create_index(
            "ix_businesses_name", "businesses", ["name"], unique=True
        )

    user_cols = {c["name"] for c in inspector.get_columns("users")}
    if "business_id" not in user_cols:
        op.add_column(
            "users",
            sa.Column(
                "business_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("businesses.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index("ix_users_business_id", "users", ["business_id"])


def downgrade() -> None:
    op.drop_index("ix_users_business_id", table_name="users")
    op.drop_column("users", "business_id")
    op.drop_index("ix_businesses_name", table_name="businesses")
    op.drop_table("businesses")
