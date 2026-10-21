"""Drop stale project_id column from quotations

The quotations table in some environments still carries a legacy
project_id NOT NULL column that predates the client_id/design_id
schema and is no longer part of the Quotation model. It blocks
inserts that only populate client_id/design_id.

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-13
"""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    has_col = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='quotations' AND column_name='project_id'"
        )
    ).fetchone()
    if has_col:
        op.drop_column("quotations", "project_id")


def downgrade() -> None:
    pass
