"""add public portfolio: business token and per-design opt-in

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "portfolio_token" not in _columns("businesses"):
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
    if "in_portfolio" not in _columns("designs"):
        op.add_column(
            "designs",
            sa.Column(
                "in_portfolio",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )


def downgrade() -> None:
    op.drop_column("designs", "in_portfolio")
    op.drop_index("ix_businesses_portfolio_token", table_name="businesses")
    op.drop_column("businesses", "portfolio_token")
