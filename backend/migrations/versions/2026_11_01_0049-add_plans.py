"""plans table; business limits become overrides that follow the plan

Revision ID: 0049
Revises: 0048
Create Date: 2026-11-01
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None

_OVERRIDES = ("max_users", "max_images", "max_image_mb")
_NEW_OVERRIDES = (
    "max_clients",
    "max_quotation_versions",
    "max_portfolio_designs",
)


def _flag(name: str) -> sa.Column:
    return sa.Column(
        name, sa.Boolean(), nullable=False, server_default="false"
    )


def _count(name: str, *, nullable: bool = True) -> sa.Column:
    return sa.Column(name, sa.Integer(), nullable=nullable)


def upgrade() -> None:
    # A dev server's create_all may have made the table already.
    if "plans" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("plans")
    op.create_table(
        "plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("tagline", sa.String(255)),
        sa.Column(
            "is_public", sa.Boolean(), nullable=False, server_default="true"
        ),
        _flag("is_recommended"),
        sa.Column(
            "sort_order", sa.Integer(), nullable=False, server_default="0"
        ),
        _count("price_monthly_inr"),
        _count("price_yearly_inr"),
        _count("max_users"),
        _count("max_clients"),
        _count("max_quotation_versions"),
        _count("max_images"),
        _count("max_image_mb"),
        _count("max_portfolio_designs"),
        _count("ai_credits_monthly"),
        _flag("clean_export"),
        _flag("branded_export"),
        _flag("bulk_materials_import"),
        _flag("priority_support"),
        _flag("website_enabled"),
        sa.Column(
            "website_templates",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "website_max_pages",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        _flag("website_custom_domain"),
        _flag("website_remove_badge"),
        sa.Column(
            "highlights",
            postgresql.JSONB(),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )

    op.alter_column(
        "businesses",
        "plan",
        type_=sa.String(32),
        existing_nullable=False,
        existing_server_default="free",
    )
    # The old two-tier "pro" becomes Studio.
    op.execute("UPDATE businesses SET plan = 'studio' WHERE plan = 'pro'")

    # Limits were set explicitly per business; they now follow the plan
    # unless an admin sets an override.
    for col in _OVERRIDES:
        op.alter_column("businesses", col, server_default=None)
        op.execute(f"UPDATE businesses SET {col} = NULL")
    for col in _NEW_OVERRIDES:
        op.add_column("businesses", _count(col))
    op.add_column(
        "businesses",
        sa.Column(
            "ai_credit_bonus", sa.Integer(), nullable=False, server_default="0"
        ),
    )


def downgrade() -> None:
    op.drop_column("businesses", "ai_credit_bonus")
    for col in _NEW_OVERRIDES:
        op.drop_column("businesses", col)
    for col, default in (
        ("max_users", 5),
        ("max_images", 50),
        ("max_image_mb", 5),
    ):
        op.execute(
            f"UPDATE businesses SET {col} = {default} WHERE {col} IS NULL"
        )
        op.alter_column("businesses", col, server_default=str(default))
    op.execute("UPDATE businesses SET plan = 'pro' WHERE plan <> 'free'")
    op.alter_column(
        "businesses", "plan", type_=sa.String(10), existing_nullable=False
    )
    op.drop_table("plans")
