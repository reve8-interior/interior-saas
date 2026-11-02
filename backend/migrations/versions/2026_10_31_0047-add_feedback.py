"""store star ratings and multiple-choice feedback per feature

Revision ID: 0047
Revises: 0046
Create Date: 2026-10-31
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The app's startup can create the table from the model before this runs.
    if "feedback" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "feedback",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "business_id",
            UUID(as_uuid=True),
            sa.ForeignKey("businesses.id", ondelete="SET NULL"),
        ),
        sa.Column("feature", sa.String(32), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("choice", sa.String(48)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "user_id", "feature", name="uq_feedback_user_feature"
        ),
    )
    op.create_index("ix_feedback_user_id", "feedback", ["user_id"])
    op.create_index("ix_feedback_business_id", "feedback", ["business_id"])


def downgrade() -> None:
    op.drop_table("feedback")
