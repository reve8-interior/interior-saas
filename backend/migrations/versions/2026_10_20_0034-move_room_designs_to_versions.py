"""attach design images to quotation versions (not shares); tag designs

Revision ID: 0034
Revises: 0033
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "quotation_versions",
        sa.Column(
            "room_designs",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
    )
    op.add_column(
        "designs",
        sa.Column(
            "rooms", postgresql.JSONB(), nullable=False, server_default="[]"
        ),
    )
    op.drop_column("quotation_shares", "room_designs")


def downgrade() -> None:
    op.add_column(
        "quotation_shares",
        sa.Column(
            "room_designs",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
    )
    op.drop_column("designs", "rooms")
    op.drop_column("quotation_versions", "room_designs")
