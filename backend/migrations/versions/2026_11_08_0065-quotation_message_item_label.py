"""customer questions can be about one quotation line

Revision ID: 0065
Revises: 0064
Create Date: 2026-11-08
"""

from alembic import op

revision = "0065"
down_revision = "0064"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE quotation_messages "
        "ADD COLUMN IF NOT EXISTS item_label VARCHAR(300)"
    )


def downgrade() -> None:
    op.drop_column("quotation_messages", "item_label")
