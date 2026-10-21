"""replace businesses.openai_model with three price-tier models

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None

_TIER_COLUMNS = (
    "openai_model_economy",
    "openai_model_balanced",
    "openai_model_premium",
)


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    cols = _columns("businesses")
    for name in _TIER_COLUMNS:
        if name not in cols:
            op.add_column("businesses", sa.Column(name, sa.String(100)))
    if "openai_model" in cols:
        # The single model a business had becomes its Balanced tier.
        op.execute(
            "UPDATE businesses SET openai_model_balanced = openai_model "
            "WHERE openai_model IS NOT NULL"
        )
        op.drop_column("businesses", "openai_model")


def downgrade() -> None:
    op.add_column("businesses", sa.Column("openai_model", sa.String(100)))
    op.execute(
        "UPDATE businesses SET openai_model = openai_model_balanced "
        "WHERE openai_model_balanced IS NOT NULL"
    )
    for name in _TIER_COLUMNS:
        op.drop_column("businesses", name)
