"""Add source_checkpoint_id to quotation_line_items.

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-18
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    has_col = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='quotation_line_items' "
            "AND column_name='source_checkpoint_id'"
        )
    ).fetchone()
    if not has_col:
        op.add_column(
            "quotation_line_items",
            sa.Column(
                "source_checkpoint_id",
                UUID(as_uuid=True),
                sa.ForeignKey("checkpoints.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index(
            "ix_quotation_line_items_source_checkpoint_id",
            "quotation_line_items",
            ["source_checkpoint_id"],
        )


def downgrade() -> None:
    op.drop_index(
        "ix_quotation_line_items_source_checkpoint_id", "quotation_line_items"
    )
    op.drop_column("quotation_line_items", "source_checkpoint_id")
