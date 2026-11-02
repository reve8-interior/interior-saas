"""flag the demo client offered to new users

Revision ID: 0048
Revises: 0047
Create Date: 2026-11-01
"""

import sqlalchemy as sa
from alembic import op

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {
        c["name"] for c in sa.inspect(op.get_bind()).get_columns("clients")
    }
    if "is_sample" in columns:
        return
    op.add_column(
        "clients",
        sa.Column(
            "is_sample",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("clients", "is_sample")
