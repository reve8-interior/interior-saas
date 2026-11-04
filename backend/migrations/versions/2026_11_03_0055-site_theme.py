"""add site_theme to businesses

Revision ID: 0055
Revises: 0054
Create Date: 2026-11-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column(
            "site_theme",
            sa.String(30),
            nullable=False,
            server_default="classic",
        ),
    )


def downgrade() -> None:
    op.drop_column("businesses", "site_theme")
