"""add per-business image upload limits

Revision ID: 0030
Revises: 0029
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = {
        c["name"] for c in sa.inspect(op.get_bind()).get_columns("businesses")
    }
    if "max_images" not in cols:
        op.add_column(
            "businesses",
            sa.Column(
                "max_images", sa.Integer(), nullable=True, server_default="50"
            ),
        )
    if "max_image_mb" not in cols:
        op.add_column(
            "businesses",
            sa.Column(
                "max_image_mb", sa.Integer(), nullable=True, server_default="5"
            ),
        )


def downgrade() -> None:
    op.drop_column("businesses", "max_image_mb")
    op.drop_column("businesses", "max_images")
