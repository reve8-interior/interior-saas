"""mark the quotation version agreed with the client

Revision ID: 0039
Revises: 0038
Create Date: 2026-10-21
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "quotation_versions",
        sa.Column(
            "is_agreed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "quotation_versions",
        sa.Column("agreed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "quotation_versions",
        sa.Column(
            "agreed_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "uq_quotation_versions_agreed",
        "quotation_versions",
        ["quotation_id"],
        unique=True,
        postgresql_where=sa.text("is_agreed"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_quotation_versions_agreed", table_name="quotation_versions"
    )
    op.drop_column("quotation_versions", "agreed_by_id")
    op.drop_column("quotation_versions", "agreed_at")
    op.drop_column("quotation_versions", "is_agreed")
