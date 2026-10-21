"""Add completed_at to clients

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-26
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    has_col = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='clients' AND column_name='completed_at'"
        )
    ).fetchone()
    if not has_col:
        op.add_column(
            "clients",
            sa.Column(
                "completed_at", sa.DateTime(timezone=True), nullable=True
            ),
        )
    op.execute(
        "UPDATE clients SET completed_at = updated_at "
        "WHERE current_phase = 'completed' AND completed_at IS NULL"
    )


def downgrade() -> None:
    op.drop_column("clients", "completed_at")
