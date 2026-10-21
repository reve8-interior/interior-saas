"""add design image storage, hotspots and public share links

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-11
"""

import sqlalchemy as sa
from alembic import op
from backend.rls import apply_rls
from sqlalchemy.dialects import postgresql

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    cols = {c["name"] for c in inspector.get_columns("designs")}
    if "storage_path" not in cols:
        op.add_column(
            "designs", sa.Column("storage_path", sa.String(500), nullable=True)
        )

    tables = set(inspector.get_table_names())
    if "design_hotspots" not in tables:
        op.create_table(
            "design_hotspots",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "design_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("designs.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "material_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("materials_rates.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("label", sa.String(255), nullable=False),
            sa.Column("notes", sa.String(2000), nullable=True),
            sa.Column("x", sa.Float(), nullable=False),
            sa.Column("y", sa.Float(), nullable=False),
            sa.Column("w", sa.Float(), nullable=False, server_default="0"),
            sa.Column("h", sa.Float(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True)),
        )
        op.create_index(
            "ix_design_hotspots_design_id", "design_hotspots", ["design_id"]
        )

    if "share_links" not in tables:
        op.create_table(
            "share_links",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "client_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("clients.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("token", sa.String(64), nullable=False),
            sa.Column("design_ids", postgresql.JSONB(), nullable=True),
            sa.Column(
                "show_prices",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
            sa.Column("expires_at", sa.DateTime(timezone=True)),
            sa.Column("revoked_at", sa.DateTime(timezone=True)),
            sa.Column(
                "created_by_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True)),
        )
        op.create_index(
            "ix_share_links_client_id", "share_links", ["client_id"]
        )
        op.create_index(
            "ix_share_links_token", "share_links", ["token"], unique=True
        )

    apply_rls(conn)


def downgrade() -> None:
    for table in ("share_links", "design_hotspots"):
        op.execute(f"DROP POLICY IF EXISTS business_isolation ON {table}")
        op.drop_table(table)
    op.drop_column("designs", "storage_path")
