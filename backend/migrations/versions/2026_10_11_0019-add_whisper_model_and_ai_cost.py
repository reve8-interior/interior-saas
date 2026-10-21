"""add whisper model to businesses and cost to agent_audit_log

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-11
"""

import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "openai_whisper_model" not in _columns("businesses"):
        op.add_column(
            "businesses",
            sa.Column("openai_whisper_model", sa.String(100)),
        )
    if "cost_usd" not in _columns("agent_audit_log"):
        op.add_column(
            "agent_audit_log",
            sa.Column("cost_usd", sa.Numeric(12, 6)),
        )
        _backfill_chat_cost()


def _backfill_chat_cost() -> None:
    """Price existing chat calls from their token counts."""
    from backend.services.ai_pricing import chat_cost

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, model, input_tokens, output_tokens "
            "FROM agent_audit_log WHERE input_tokens IS NOT NULL "
            "OR output_tokens IS NOT NULL"
        )
    ).all()
    for row_id, model, tokens_in, tokens_out in rows:
        cost = chat_cost(model, tokens_in, tokens_out)
        if cost is not None:
            bind.execute(
                sa.text(
                    "UPDATE agent_audit_log SET cost_usd = :c WHERE id = :i"
                ),
                {"c": cost, "i": row_id},
            )


def downgrade() -> None:
    op.drop_column("agent_audit_log", "cost_usd")
    op.drop_column("businesses", "openai_whisper_model")
