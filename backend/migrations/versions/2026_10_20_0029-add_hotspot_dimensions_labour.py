"""add dimensions and labour cost to design hotspots

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = {
        c["name"]
        for c in sa.inspect(op.get_bind()).get_columns("design_hotspots")
    }
    if "dimensions" not in cols:
        op.add_column(
            "design_hotspots",
            sa.Column("dimensions", sa.String(100), nullable=True),
        )
    if "labour_cost" not in cols:
        op.add_column(
            "design_hotspots",
            sa.Column("labour_cost", sa.Numeric(12, 2), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("design_hotspots", "labour_cost")
    op.drop_column("design_hotspots", "dimensions")
