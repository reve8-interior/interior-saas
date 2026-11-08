"""floor plan image kept on the checkpoint it produced

Revision ID: 0064
Revises: 0063
Create Date: 2026-11-08
"""

from alembic import op

revision = "0064"
down_revision = "0063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE checkpoints "
        "ADD COLUMN IF NOT EXISTS source_image_path TEXT"
    )


def downgrade() -> None:
    op.drop_column("checkpoints", "source_image_path")
