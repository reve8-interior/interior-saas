"""Add agent_audit_log table, audio_transcript column, and ai_extract enum value.

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-16
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Table may already exist if create_all ran before this migration
    if not conn.dialect.has_table(conn, "agent_audit_log"):
        op.create_table(
            "agent_audit_log",
            sa.Column(
                "id",
                postgresql.UUID(as_uuid=True),
                primary_key=True,
            ),
            sa.Column(
                "client_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("clients.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("operation", sa.String(100), nullable=False),
            sa.Column("model", sa.String(100), nullable=False),
            sa.Column("input_tokens", sa.Integer, nullable=True),
            sa.Column("output_tokens", sa.Integer, nullable=True),
            sa.Column("latency_ms", sa.Integer, nullable=True),
            sa.Column(
                "status",
                sa.String(50),
                nullable=False,
                server_default="success",
            ),
            sa.Column("raw_input_hash", sa.String(64), nullable=True),
            sa.Column(
                "timestamp",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                index=True,
            ),
        )

    # Column may already exist if create_all ran before this migration
    has_col = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='checkpoints' AND column_name='audio_transcript'"
        )
    ).fetchone()
    if not has_col:
        op.add_column(
            "checkpoints",
            sa.Column("audio_transcript", sa.Text, nullable=True),
        )

    # Add ai_extract to the checkpoint_source enum (idempotent)
    op.execute(
        "ALTER TYPE checkpoint_source ADD VALUE IF NOT EXISTS 'ai_extract'"
    )


def downgrade() -> None:
    op.drop_column("checkpoints", "audio_transcript")
    op.drop_table("agent_audit_log")
    # Note: PostgreSQL does not support removing enum values; downgrade
    # leaves ai_extract in the enum type.
