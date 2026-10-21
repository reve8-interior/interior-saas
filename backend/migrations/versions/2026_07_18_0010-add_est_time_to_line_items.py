"""Add est_time (estimated completion time) to quotation_line_items.

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    has_col = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='quotation_line_items' "
            "AND column_name='est_time'"
        )
    ).fetchone()
    if not has_col:
        op.add_column(
            "quotation_line_items",
            sa.Column("est_time", sa.String(50), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("quotation_line_items", "est_time")
