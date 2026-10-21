"""drop the business-wide portfolio link; expiring shares replace it

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = {
        c["name"] for c in sa.inspect(op.get_bind()).get_columns("businesses")
    }
    if "portfolio_token" in cols:
        op.drop_index("ix_businesses_portfolio_token", table_name="businesses")
        op.drop_column("businesses", "portfolio_token")


def downgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column("portfolio_token", sa.String(64), nullable=True),
    )
    op.create_index(
        "ix_businesses_portfolio_token",
        "businesses",
        ["portfolio_token"],
        unique=True,
    )
