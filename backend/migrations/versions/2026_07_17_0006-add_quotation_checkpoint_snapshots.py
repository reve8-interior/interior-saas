"""Add checkpoint_id and snapshots columns to quotations table.

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-17
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    has_checkpoint_id = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='quotations' AND column_name='checkpoint_id'"
        )
    ).fetchone()
    if not has_checkpoint_id:
        op.add_column(
            "quotations",
            sa.Column(
                "checkpoint_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("checkpoints.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )

    has_snapshots = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='quotations' AND column_name='snapshots'"
        )
    ).fetchone()
    if not has_snapshots:
        op.add_column(
            "quotations",
            sa.Column(
                "snapshots",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default="[]",
            ),
        )


def downgrade() -> None:
    op.drop_column("quotations", "snapshots")
    op.drop_column("quotations", "checkpoint_id")
