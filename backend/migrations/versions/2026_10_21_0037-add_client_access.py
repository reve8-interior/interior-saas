"""per-client access for designers

Revision ID: 0037
Revises: 0036
Create Date: 2026-10-21
"""

import sqlalchemy as sa
from alembic import op
from backend.rls import apply_rls
from sqlalchemy.dialects import postgresql

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "client_access",
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        # App startup's create_all() may have built the table already.
        if_not_exists=True,
    )
    op.create_index(
        "ix_client_access_user_id",
        "client_access",
        ["user_id"],
        if_not_exists=True,
    )
    apply_rls(op.get_bind())


def downgrade() -> None:
    op.drop_index("ix_client_access_user_id", table_name="client_access")
    op.drop_table("client_access")
