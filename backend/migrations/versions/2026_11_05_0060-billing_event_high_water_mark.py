"""newest applied billing webhook time, so older redeliveries are ignored

Revision ID: 0060
Revises: 0059
Create Date: 2026-11-05
"""

from alembic import op

revision = "0060"
down_revision = "0059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE businesses "
        "ADD COLUMN IF NOT EXISTS last_billing_event_at TIMESTAMP WITH TIME ZONE"
    )


def downgrade() -> None:
    op.drop_column("businesses", "last_billing_event_at")
