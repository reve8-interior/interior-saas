"""Single quotation engine: rename boq_line_items to quotation_line_items,
drop the legacy breakdown columns from quotations.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-16
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("boq_line_items", "quotation_line_items")
    op.execute("ALTER TYPE boq_item_status RENAME TO quotation_item_status")
    op.execute("ALTER TYPE boq_catalog_type RENAME TO quotation_catalog_type")
    op.execute(
        "ALTER INDEX ix_boq_line_items_quotation_id "
        "RENAME TO ix_quotation_line_items_quotation_id"
    )
    op.execute(
        "ALTER INDEX ix_boq_line_items_room "
        "RENAME TO ix_quotation_line_items_room"
    )
    op.execute(
        "ALTER INDEX ix_boq_line_items_status "
        "RENAME TO ix_quotation_line_items_status"
    )

    op.drop_column("quotations", "breakdown_json")
    op.drop_column("quotations", "total_min")
    op.drop_column("quotations", "total_max")


def downgrade() -> None:
    import sqlalchemy as sa
    from sqlalchemy.dialects import postgresql

    op.add_column(
        "quotations",
        sa.Column("total_max", sa.Numeric(14, 2), nullable=True),
    )
    op.add_column(
        "quotations",
        sa.Column("total_min", sa.Numeric(14, 2), nullable=True),
    )
    op.add_column(
        "quotations",
        sa.Column(
            "breakdown_json",
            postgresql.JSONB,
            nullable=True,
            server_default="{}",
        ),
    )

    op.execute(
        "ALTER INDEX ix_quotation_line_items_status "
        "RENAME TO ix_boq_line_items_status"
    )
    op.execute(
        "ALTER INDEX ix_quotation_line_items_room "
        "RENAME TO ix_boq_line_items_room"
    )
    op.execute(
        "ALTER INDEX ix_quotation_line_items_quotation_id "
        "RENAME TO ix_boq_line_items_quotation_id"
    )
    op.execute("ALTER TYPE quotation_catalog_type RENAME TO boq_catalog_type")
    op.execute("ALTER TYPE quotation_item_status RENAME TO boq_item_status")
    op.rename_table("quotation_line_items", "boq_line_items")
