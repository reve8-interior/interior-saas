"""Add boq_line_items table

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-16
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "boq_line_items",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "quotation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("quotations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("room", sa.String(100), nullable=False),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column(
            "catalog_type",
            sa.Enum("core_works", "loose_furniture", name="boq_catalog_type"),
            nullable=False,
            server_default="core_works",
        ),
        sa.Column("unit", sa.String(20), nullable=False),
        sa.Column("raw_dimension", sa.String(50), nullable=True),
        sa.Column("computed_sqft", sa.Numeric(10, 2), nullable=True),
        sa.Column("qty", sa.Numeric(10, 2), nullable=True),
        sa.Column("rate", sa.Numeric(12, 2), nullable=True),
        sa.Column("initial_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("negotiated_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("remarks", sa.String(2000), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "priced",
                "pending_clarity",
                "agreed",
                "removed",
                name="boq_item_status",
            ),
            nullable=False,
            server_default="draft",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_boq_line_items_quotation_id", "boq_line_items", ["quotation_id"]
    )
    op.create_index("ix_boq_line_items_room", "boq_line_items", ["room"])
    op.create_index("ix_boq_line_items_status", "boq_line_items", ["status"])


def downgrade() -> None:
    op.drop_table("boq_line_items")
    sa.Enum(name="boq_item_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="boq_catalog_type").drop(op.get_bind(), checkfirst=True)
