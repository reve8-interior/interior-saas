"""per-business OpenAI key and business-scoped AI usage log

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-11
"""

import sqlalchemy as sa
from alembic import op
from backend.rls import BUSINESS_ID_DEFAULT, apply_rls
from sqlalchemy.dialects import postgresql

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    biz_cols = {c["name"] for c in inspector.get_columns("businesses")}
    if "openai_api_key_enc" not in biz_cols:
        op.add_column("businesses", sa.Column("openai_api_key_enc", sa.Text()))
        op.add_column(
            "businesses", sa.Column("openai_key_last4", sa.String(8))
        )
        op.add_column(
            "businesses",
            sa.Column("openai_key_updated_at", sa.DateTime(timezone=True)),
        )

    log_cols = {c["name"] for c in inspector.get_columns("agent_audit_log")}
    if "business_id" not in log_cols:
        op.add_column(
            "agent_audit_log",
            sa.Column(
                "business_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("businesses.id", ondelete="CASCADE"),
                nullable=True,
            ),
        )
        op.create_index(
            "ix_agent_audit_log_business_id",
            "agent_audit_log",
            ["business_id"],
        )
    op.execute(
        "ALTER TABLE agent_audit_log ALTER COLUMN business_id "
        f"SET DEFAULT {BUSINESS_ID_DEFAULT}"
    )
    # Calls such as materials extraction have no client.
    op.alter_column(
        "agent_audit_log", "client_id", existing_nullable=False, nullable=True
    )
    op.execute(
        """
        UPDATE agent_audit_log l SET business_id = c.business_id
        FROM clients c
        WHERE l.client_id = c.id AND l.business_id IS NULL
        """
    )

    apply_rls(conn)


def downgrade() -> None:
    op.drop_index("ix_agent_audit_log_business_id", "agent_audit_log")
    op.drop_column("agent_audit_log", "business_id")
    op.drop_column("businesses", "openai_key_updated_at")
    op.drop_column("businesses", "openai_key_last4")
    op.drop_column("businesses", "openai_api_key_enc")
