"""team management: viewer role, seat limit, last login, audit business scope

Revision ID: 0036
Revises: 0035
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op
from backend.rls import BUSINESS_ID_DEFAULT
from sqlalchemy.dialects import postgresql

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A new enum value cannot be used in the transaction that adds it.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer'")

    op.add_column(
        "businesses",
        sa.Column(
            "max_users", sa.Integer(), nullable=True, server_default="5"
        ),
    )
    op.add_column(
        "users",
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "audit_log",
        sa.Column(
            "business_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=True,
            server_default=sa.text(BUSINESS_ID_DEFAULT),
        ),
    )
    op.create_index("ix_audit_log_business_id", "audit_log", ["business_id"])
    # Existing entries belong to the business of the user who acted.
    op.execute(
        """
        UPDATE audit_log a SET business_id = u.business_id
        FROM users u
        WHERE a.user_id = u.id AND a.business_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_audit_log_business_id", table_name="audit_log")
    op.drop_column("audit_log", "business_id")
    op.drop_column("users", "last_login_at")
    op.drop_column("businesses", "max_users")
