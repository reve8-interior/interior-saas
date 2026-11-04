"""add the AI intake and team-safety lines to the built-in plans' highlights

Only plans whose highlights still equal the original seed are changed, so a
plan the platform admin has edited keeps exactly what they wrote.

Revision ID: 0057
Revises: 0056
Create Date: 2026-11-03
"""

import json

import sqlalchemy as sa
from alembic import op

revision = "0057"
down_revision = "0056"
branch_labels = None
depends_on = None

AI = "AI quotes from notes, voice, text or a floor plan"
TEAM = "Duplicate checks and edit protection for your team"

# slug -> (highlights as first seeded, highlights with the new lines)
CHANGES = {
    "free": (
        ["Watermarked exports", "Community support"],
        ["Watermarked exports", "Community support", AI],
    ),
    "solo": (
        ["Clean exports", "Email support"],
        ["Clean exports", "Email support", AI, TEAM],
    ),
    "studio": (
        ["Unlimited clients and quotation versions"],
        ["Unlimited clients and quotation versions", AI, TEAM],
    ),
    "studio_pro": (
        ["Your logo on exports", "Bulk materials import"],
        ["Your logo on exports", "Bulk materials import", AI, TEAM],
    ),
}


def _swap(source: int, target: int) -> None:
    update = sa.text(
        "UPDATE plans SET highlights = CAST(:new AS jsonb) "
        "WHERE slug = :slug AND highlights = CAST(:old AS jsonb)"
    )
    for slug, versions in CHANGES.items():
        op.get_bind().execute(
            update,
            {
                "slug": slug,
                "old": json.dumps(versions[source]),
                "new": json.dumps(versions[target]),
            },
        )


def upgrade() -> None:
    _swap(0, 1)


def downgrade() -> None:
    _swap(1, 0)
