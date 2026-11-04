"""capture AI run proposals, final outputs and guard flags

Revision ID: 0056
Revises: 0055
Create Date: 2026-11-03
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agent_audit_log",
        sa.Column("prompt_version", sa.String(20), nullable=True),
    )
    op.add_column(
        "agent_audit_log",
        sa.Column(
            "guard_flags",
            JSONB,
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "agent_audit_log", sa.Column("proposed_output", JSONB, nullable=True)
    )
    op.add_column(
        "agent_audit_log", sa.Column("final_output", JSONB, nullable=True)
    )


def downgrade() -> None:
    op.drop_column("agent_audit_log", "final_output")
    op.drop_column("agent_audit_log", "proposed_output")
    op.drop_column("agent_audit_log", "guard_flags")
    op.drop_column("agent_audit_log", "prompt_version")
