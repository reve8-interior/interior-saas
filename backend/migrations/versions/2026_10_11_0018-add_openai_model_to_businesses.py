"""add openai_model to businesses

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-11
"""

import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = {
        c["name"] for c in sa.inspect(op.get_bind()).get_columns("businesses")
    }
    if "openai_model" not in cols:
        op.add_column("businesses", sa.Column("openai_model", sa.String(100)))


def downgrade() -> None:
    op.drop_column("businesses", "openai_model")
