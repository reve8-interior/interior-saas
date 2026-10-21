"""add payment countdown fields to businesses

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-11
"""

import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    cols = _columns("businesses")
    if "access_expires_at" not in cols:
        op.add_column(
            "businesses",
            sa.Column("access_expires_at", sa.DateTime(timezone=True)),
        )
    if "warning_days" not in cols:
        op.add_column(
            "businesses",
            sa.Column(
                "warning_days",
                sa.Integer(),
                nullable=False,
                server_default="7",
            ),
        )


def downgrade() -> None:
    op.drop_column("businesses", "warning_days")
    op.drop_column("businesses", "access_expires_at")
