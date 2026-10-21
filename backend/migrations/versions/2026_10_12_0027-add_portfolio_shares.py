"""add expiring portfolio share links

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op
from backend.rls import apply_rls
from sqlalchemy.dialects import postgresql

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    if "portfolio_shares" not in sa.inspect(conn).get_table_names():
        op.create_table(
            "portfolio_shares",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "business_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("businesses.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("token", sa.String(64), nullable=False),
            sa.Column("design_ids", postgresql.JSONB(), nullable=False),
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
            "ix_portfolio_shares_business_id",
            "portfolio_shares",
            ["business_id"],
        )
        op.create_index(
            "ix_portfolio_shares_token",
            "portfolio_shares",
            ["token"],
            unique=True,
        )
    apply_rls(conn)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS business_isolation ON portfolio_shares")
    op.drop_table("portfolio_shares")
