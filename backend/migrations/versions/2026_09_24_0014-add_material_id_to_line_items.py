"""add_material_id_to_line_items

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-24

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "quotation_line_items",
        sa.Column(
            "material_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_quotation_line_items_material_id",
        "quotation_line_items",
        ["material_id"],
    )
    # Only add foreign key if materials_rates table exists
    conn = op.get_bind()
    has_materials_table = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_name='materials_rates'"
        )
    ).fetchone()
    if has_materials_table:
        op.create_foreign_key(
            "fk_quotation_line_items_material_id",
            "quotation_line_items",
            "materials_rates",
            ["material_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    conn = op.get_bind()
    has_fk = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE table_name='quotation_line_items' "
            "AND constraint_name='fk_quotation_line_items_material_id'"
        )
    ).fetchone()
    if has_fk:
        op.drop_constraint(
            "fk_quotation_line_items_material_id",
            "quotation_line_items",
            type_="foreignkey",
        )
    op.drop_index(
        "ix_quotation_line_items_material_id",
        table_name="quotation_line_items",
    )
    op.drop_column("quotation_line_items", "material_id")
