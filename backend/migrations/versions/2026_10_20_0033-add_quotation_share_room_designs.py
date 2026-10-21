"""attach design images to rooms of a shared quotation

Revision ID: 0033
Revises: 0032
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "quotation_shares",
        sa.Column(
            "room_designs",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
    )


def downgrade() -> None:
    op.drop_column("quotation_shares", "room_designs")
