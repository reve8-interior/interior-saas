"""add quotation versions and per-version share links

Revision ID: 0032
Revises: 0031
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op
from backend.rls import apply_rls
from sqlalchemy.dialects import postgresql

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    tables = sa.inspect(conn).get_table_names()
    if "quotation_versions" not in tables:
        op.create_table(
            "quotation_versions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "quotation_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("quotations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("number", sa.Integer(), nullable=False),
            sa.Column("label", sa.String(120)),
            sa.Column("line_items", postgresql.JSONB(), nullable=False),
            sa.Column("initial_total", sa.Numeric(14, 2)),
            sa.Column("negotiated_total", sa.Numeric(14, 2)),
            sa.Column(
                "checkpoint_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("checkpoints.id", ondelete="SET NULL"),
            ),
            sa.Column(
                "created_by_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
            ),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.UniqueConstraint("quotation_id", "number"),
        )
        op.create_index(
            "ix_quotation_versions_quotation_id",
            "quotation_versions",
            ["quotation_id"],
        )
    if "quotation_shares" not in tables:
        op.create_table(
            "quotation_shares",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "version_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("quotation_versions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("token", sa.String(64), nullable=False),
            sa.Column(
                "show_prices",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
            sa.Column("expires_at", sa.DateTime(timezone=True)),
            sa.Column("revoked_at", sa.DateTime(timezone=True)),
            sa.Column(
                "created_by_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
            ),
            sa.Column("created_at", sa.DateTime(timezone=True)),
        )
        op.create_index(
            "ix_quotation_shares_version_id",
            "quotation_shares",
            ["version_id"],
        )
        op.create_index(
            "ix_quotation_shares_token",
            "quotation_shares",
            ["token"],
            unique=True,
        )
    apply_rls(conn)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS business_isolation ON quotation_shares")
    op.drop_table("quotation_shares")
    op.execute(
        "DROP POLICY IF EXISTS business_isolation ON quotation_versions"
    )
    op.drop_table("quotation_versions")
