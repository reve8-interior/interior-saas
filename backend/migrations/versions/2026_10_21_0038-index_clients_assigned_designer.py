"""index clients.assigned_designer_id

Designer-scoped client lists filter on it (client_access_clause) and
the FK lookup on user removal scans it.

Revision ID: 0038
Revises: 0037
Create Date: 2026-10-21
"""

from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_clients_assigned_designer_id",
        "clients",
        ["assigned_designer_id"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_clients_assigned_designer_id", table_name="clients")
