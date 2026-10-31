"""index foreign keys that cascade or null out, and open customer questions

Deleting a line item, design, checkpoint or version makes Postgres scan every
referencing table to apply ON DELETE SET NULL; without an index on the
referencing column that is a sequential scan per delete. The partial index
serves the dashboard's "open questions" feed.

Revision ID: 0046
Revises: 0045
Create Date: 2026-10-31
"""

from alembic import op

revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None

_FK_INDEXES = [
    ("design_hotspots", "material_id"),
    ("design_hotspots", "quotation_line_item_id"),
    ("quotations", "design_id"),
    ("quotations", "checkpoint_id"),
    ("quotation_versions", "checkpoint_id"),
    ("quotation_messages", "version_id"),
    ("final_summaries", "checkpoint_id_ref"),
]
_OPEN_QUESTIONS = "ix_quotation_messages_open_questions"


def upgrade() -> None:
    for table, column in _FK_INDEXES:
        op.create_index(
            f"ix_{table}_{column}", table, [column], if_not_exists=True
        )
    op.create_index(
        _OPEN_QUESTIONS,
        "quotation_messages",
        ["quotation_id"],
        postgresql_where="kind = 'question' AND resolved_at IS NULL",
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index(_OPEN_QUESTIONS, table_name="quotation_messages")
    for table, column in reversed(_FK_INDEXES):
        op.drop_index(f"ix_{table}_{column}", table_name=table)
