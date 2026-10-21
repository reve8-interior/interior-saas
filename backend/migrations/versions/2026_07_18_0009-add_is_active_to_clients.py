"""Add is_active to clients for soft-delete support

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    has_col = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='clients' AND column_name='is_active'"
        )
    ).fetchone()
    if not has_col:
        op.add_column(
            "clients",
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
        )


def downgrade() -> None:
    op.drop_column("clients", "is_active")
