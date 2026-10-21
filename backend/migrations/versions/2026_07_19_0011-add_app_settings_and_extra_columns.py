"""Add app_settings table and extra (custom columns) on line items.

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-19
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    has_table = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_name='app_settings'"
        )
    ).fetchone()
    if not has_table:
        op.create_table(
            "app_settings",
            sa.Column("key", sa.String(100), primary_key=True),
            sa.Column(
                "value",
                JSONB,
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.Column("updated_at", sa.DateTime(timezone=True)),
        )

    has_col = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='quotation_line_items' "
            "AND column_name='extra'"
        )
    ).fetchone()
    if not has_col:
        op.add_column(
            "quotation_line_items",
            sa.Column(
                "extra",
                JSONB,
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )


def downgrade() -> None:
    op.drop_column("quotation_line_items", "extra")
    op.drop_table("app_settings")
