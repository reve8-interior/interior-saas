"""record when, and by whom, a meeting's rows were added to the quotation

Revision ID: 0044
Revises: 0043
Create Date: 2026-10-31
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = {
        c["name"] for c in sa.inspect(op.get_bind()).get_columns("checkpoints")
    }
    if "applied_at" not in cols:
        op.add_column(
            "checkpoints",
            sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        )
        # Earlier additions have no recorded time; creation order is the
        # best stand-in, and it keeps "undo newest first" working for them.
        op.execute(
            "UPDATE checkpoints SET applied_at = created_at "
            "WHERE added_to_quotation"
        )
    if "applied_by_id" not in cols:
        op.add_column(
            "checkpoints",
            sa.Column(
                "applied_by_id",
                UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )


def downgrade() -> None:
    op.drop_column("checkpoints", "applied_by_id")
    op.drop_column("checkpoints", "applied_at")
