"""The 0057 data migration only touches plans still on the original seed."""

import importlib.util
from pathlib import Path

import sqlalchemy as sa

from backend.models.plan import Plan
from backend.services.plan_catalog import DEFAULTS_BY_SLUG

PATH = (
    Path(__file__).resolve().parent.parent
    / "migrations/versions/2026_11_03_0057-plan_intake_highlights.py"
)
spec = importlib.util.spec_from_file_location("m0057", PATH)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


def test_migration_ends_where_the_catalog_starts():
    for slug, (_, new) in migration.CHANGES.items():
        assert DEFAULTS_BY_SLUG[slug].highlights == new


def test_every_built_in_plan_is_covered():
    assert set(migration.CHANGES) == set(DEFAULTS_BY_SLUG)


def test_new_lines_fit_the_highlight_limits():
    for _, new in migration.CHANGES.values():
        assert len(new) <= 12 and all(len(h) <= 120 for h in new)


def run_swap(db, source, target):
    """The migration's own UPDATE, run on the test session."""
    update = sa.text(
        "UPDATE plans SET highlights = CAST(:new AS jsonb) "
        "WHERE slug = :slug AND highlights = CAST(:old AS jsonb)"
    )
    import json

    for slug, versions in migration.CHANGES.items():
        db.execute(
            update,
            {
                "slug": slug,
                "old": json.dumps(versions[source]),
                "new": json.dumps(versions[target]),
            },
        )


def test_an_untouched_plan_is_updated_and_an_edited_one_is_not(db):
    old_solo, _ = migration.CHANGES["solo"]
    db.add(
        Plan(
            **{
                **DEFAULTS_BY_SLUG["solo"].model_dump(),
                "slug": "solo",
                "highlights": old_solo,
            }
        )
    )
    db.add(
        Plan(
            **{
                **DEFAULTS_BY_SLUG["studio"].model_dump(),
                "highlights": ["My own wording"],
            }
        )
    )
    db.flush()
    run_swap(db, 0, 1)
    db.expire_all()
    rows = {p.slug: p.highlights for p in db.query(Plan).all()}
    assert rows["solo"] == migration.CHANGES["solo"][1]
    assert rows["studio"] == ["My own wording"]
    run_swap(db, 1, 0)
    db.expire_all()
    assert db.query(Plan).filter_by(slug="solo").one().highlights == old_solo
