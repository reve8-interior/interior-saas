"""one admin-set chat model per business instead of three user-picked tiers

Revision ID: 0050
Revises: 0049
Create Date: 2026-11-01
"""

import sqlalchemy as sa
from alembic import op

revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None

_TIER_COLUMNS = (
    "openai_model_economy",
    "openai_model_balanced",
    "openai_model_premium",
)


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column("openai_chat_model", sa.String(100), nullable=True),
    )
    # The middle tier was the default, so it is what users ran on.
    op.execute(
        "UPDATE businesses SET openai_chat_model = openai_model_balanced"
    )
    for col in _TIER_COLUMNS:
        op.drop_column("businesses", col)


def downgrade() -> None:
    for col in _TIER_COLUMNS:
        op.add_column(
            "businesses", sa.Column(col, sa.String(100), nullable=True)
        )
    op.execute(
        "UPDATE businesses SET openai_model_balanced = openai_chat_model"
    )
    op.drop_column("businesses", "openai_chat_model")
