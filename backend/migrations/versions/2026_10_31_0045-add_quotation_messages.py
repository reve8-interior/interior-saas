"""keep every customer message from a shared quotation, with a resolved state

Revision ID: 0045
Revises: 0044
Create Date: 2026-10-31
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    # The app's startup can create the table from the model before this runs.
    if "quotation_messages" not in inspector.get_table_names():
        _create_table()
    indexes = {i["name"] for i in inspector.get_indexes("quotation_messages")}
    if "ix_quotation_messages_quotation_id" not in indexes:
        op.create_index(
            "ix_quotation_messages_quotation_id",
            "quotation_messages",
            ["quotation_id"],
        )
    # Each link kept only its latest answer; carry those over so nothing the
    # customers already sent is lost. Skips answers already carried over.
    op.execute(
        """
        INSERT INTO quotation_messages
            (id, quotation_id, version_id, version_number, kind, name,
             message, created_at)
        SELECT gen_random_uuid(), v.quotation_id, v.id, v.number,
               s.response_kind, COALESCE(s.response_name, 'Customer'),
               s.response_message, s.responded_at
        FROM quotation_shares s
        JOIN quotation_versions v ON v.id = s.version_id
        WHERE s.response_kind IS NOT NULL AND s.responded_at IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM quotation_messages m
              WHERE m.version_id = v.id AND m.created_at = s.responded_at
          )
        """
    )


def _create_table() -> None:
    op.create_table(
        "quotation_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "quotation_id",
            UUID(as_uuid=True),
            sa.ForeignKey("quotations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "version_id",
            UUID(as_uuid=True),
            sa.ForeignKey("quotation_versions.id", ondelete="SET NULL"),
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("message", sa.String(2000)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column(
            "resolved_by_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_quotation_messages_quotation_id", table_name="quotation_messages"
    )
    op.drop_table("quotation_messages")
