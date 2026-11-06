"""row-level security policy for plans so tenant sessions can read the catalogue

Revision ID: 0063
Revises: 0062
Create Date: 2026-11-06
"""

from alembic import op
from backend.rls import apply_rls

revision = "0063"
down_revision = "0062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    apply_rls(op.get_bind())


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS business_isolation ON plans")
