"""link design hotspots to the quotation line item created from them

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-11
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = {
        c["name"]
        for c in sa.inspect(op.get_bind()).get_columns("design_hotspots")
    }
    if "quotation_line_item_id" not in cols:
        op.add_column(
            "design_hotspots",
            sa.Column(
                "quotation_line_item_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("quotation_line_items.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )


def downgrade() -> None:
    op.drop_column("design_hotspots", "quotation_line_item_id")
