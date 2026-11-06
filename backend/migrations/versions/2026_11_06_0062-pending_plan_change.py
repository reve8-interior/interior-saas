"""pending plan change on businesses

Revision ID: 0062
Revises: 0061
Create Date: 2026-11-06
"""

from alembic import op

revision = "0062"
down_revision = "0061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE businesses "
        "ADD COLUMN IF NOT EXISTS pending_plan_slug VARCHAR(32), "
        "ADD COLUMN IF NOT EXISTS pending_subscription_id VARCHAR(64), "
        "ADD COLUMN IF NOT EXISTS pending_kind VARCHAR(10)"
    )


def downgrade() -> None:
    for col in (
        "pending_kind",
        "pending_subscription_id",
        "pending_plan_slug",
    ):
        op.drop_column("businesses", col)
