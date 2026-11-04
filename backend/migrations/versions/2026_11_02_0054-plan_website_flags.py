"""enable website flags on existing plan rows

Data migration: updates only the website_* columns, by slug. Plans not
listed (free, custom plans) keep their values; no rows are deleted.

Revision ID: 0054
Revises: 0053
Create Date: 2026-11-02
"""

import sqlalchemy as sa
from alembic import op

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None

_PLANS = sa.table(
    "plans",
    sa.column("slug", sa.String),
    sa.column("website_enabled", sa.Boolean),
    sa.column("website_templates", sa.Integer),
    sa.column("website_custom_domain", sa.Boolean),
    sa.column("website_remove_badge", sa.Boolean),
)

# slug -> (enabled, templates, custom_domain, remove_badge)
_FLAGS: dict[str, tuple[bool, int, bool, bool]] = {
    "solo": (True, 1, False, False),
    "studio": (True, 1, True, False),
    "studio_pro": (True, 1, True, True),
}


def _set(slug: str, flags: tuple[bool, int, bool, bool]) -> None:
    enabled, templates, domain, badge = flags
    op.execute(
        _PLANS.update()
        .where(_PLANS.c.slug == slug)
        .values(
            website_enabled=enabled,
            website_templates=templates,
            website_custom_domain=domain,
            website_remove_badge=badge,
        )
    )


def upgrade() -> None:
    for slug, flags in _FLAGS.items():
        _set(slug, flags)


def downgrade() -> None:
    for slug in _FLAGS:
        _set(slug, (False, 0, False, False))
