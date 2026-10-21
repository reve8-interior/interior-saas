"""Add added_to_quotation flag to checkpoints table.

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-17
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    has_col = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='checkpoints' "
            "AND column_name='added_to_quotation'"
        )
    ).fetchone()
    if not has_col:
        op.add_column(
            "checkpoints",
            sa.Column(
                "added_to_quotation",
                sa.Boolean,
                nullable=False,
                server_default="false",
            ),
        )


def downgrade() -> None:
    op.drop_column("checkpoints", "added_to_quotation")
