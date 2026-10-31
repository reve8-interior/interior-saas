"""track views of a quotation share and store the customer's response

Revision ID: 0040
Revises: 0039
Create Date: 2026-10-29
"""

import sqlalchemy as sa
from alembic import op

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "quotation_shares",
        sa.Column(
            "view_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "quotation_shares",
        sa.Column("last_viewed_at", sa.DateTime(timezone=True)),
    )
    op.add_column(
        "quotation_shares", sa.Column("response_kind", sa.String(16))
    )
    op.add_column(
        "quotation_shares", sa.Column("response_name", sa.String(120))
    )
    op.add_column(
        "quotation_shares", sa.Column("response_message", sa.String(2000))
    )
    op.add_column(
        "quotation_shares",
        sa.Column("responded_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    for column in (
        "responded_at",
        "response_message",
        "response_name",
        "response_kind",
        "last_viewed_at",
        "view_count",
    ):
        op.drop_column("quotation_shares", column)
