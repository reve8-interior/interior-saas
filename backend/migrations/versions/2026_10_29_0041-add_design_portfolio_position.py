"""let designers order the portfolio

Revision ID: 0041
Revises: 0040
Create Date: 2026-10-29
"""

import sqlalchemy as sa
from alembic import op

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "designs",
        sa.Column("portfolio_position", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("designs", "portfolio_position")
