"""add designer website fields to businesses and slug_aliases

slug_aliases gets a permissive (true) RLS policy via apply_rls: slugs are
public and claims must see every business's aliases.

Revision ID: 0053
Revises: 0052
Create Date: 2026-11-02
"""

import sqlalchemy as sa
from alembic import op
from backend.rls import apply_rls
from sqlalchemy.dialects import postgresql

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("businesses", sa.Column("slug", sa.String(40)))
    op.add_column(
        "businesses",
        sa.Column(
            "site_published",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("businesses", sa.Column("site_tagline", sa.String(255)))
    op.add_column("businesses", sa.Column("site_about", sa.Text()))
    op.add_column("businesses", sa.Column("site_address", sa.String(500)))
    for col in ("site_services", "site_socials"):
        op.add_column(
            "businesses",
            sa.Column(
                col,
                postgresql.JSONB(),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
        )
    op.add_column("businesses", sa.Column("logo_path", sa.String(500)))
    op.add_column("businesses", sa.Column("hero_path", sa.String(500)))
    op.add_column(
        "businesses",
        sa.Column(
            "hide_badge",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index("ix_businesses_slug", "businesses", ["slug"], unique=True)

    op.create_table(
        "slug_aliases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(40), nullable=False),
        sa.Column(
            "business_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_slug_aliases_slug", "slug_aliases", ["slug"], unique=True
    )
    op.create_index(
        "ix_slug_aliases_business_id", "slug_aliases", ["business_id"]
    )
    # Enables RLS + permissive policy and grants for the new table.
    apply_rls(op.get_bind())


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS business_isolation ON slug_aliases")
    op.drop_table("slug_aliases")
    op.drop_index("ix_businesses_slug", table_name="businesses")
    for col in (
        "hide_badge",
        "hero_path",
        "logo_path",
        "site_socials",
        "site_services",
        "site_address",
        "site_about",
        "site_tagline",
        "site_published",
        "slug",
    ):
        op.drop_column("businesses", col)
