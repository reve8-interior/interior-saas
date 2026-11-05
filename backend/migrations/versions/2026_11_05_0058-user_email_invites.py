"""email verification and one-time invite tokens on users

Revision ID: 0058
Revises: 0057
Create Date: 2026-11-05
"""

from alembic import op

revision = "0058"
down_revision = "0057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users "
        "ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_hash VARCHAR(64)"
    )
    op.execute(
        "ALTER TABLE users "
        "ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMP WITH TIME ZONE"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_users_invite_token_hash "
        "ON users (invite_token_hash)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_invite_token_hash")
    op.drop_column("users", "invite_expires_at")
    op.drop_column("users", "invite_token_hash")
    op.drop_column("users", "email_verified_at")
