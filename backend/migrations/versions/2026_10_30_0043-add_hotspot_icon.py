"""let designers pick the icon shown on a hotspot pin

Revision ID: 0043
Revises: 0042
Create Date: 2026-10-30
"""

import sqlalchemy as sa
from alembic import op

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = {
        c["name"]
        for c in sa.inspect(op.get_bind()).get_columns("design_hotspots")
    }
    if "icon" not in cols:
        op.add_column(
            "design_hotspots",
            sa.Column("icon", sa.String(32), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("design_hotspots", "icon")
