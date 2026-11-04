import pytest
from fastapi import HTTPException

from ..models import Business
from ..services.site_slug import (
    claim_slug,
    is_reserved,
    normalize_slug,
    resolve_slug,
)
from .conftest import as_business, as_owner, make_business


def test_normalize():
    assert normalize_slug("  Sj Interiors! ") == "sj-interiors"
    assert normalize_slug("a__b  c") == "a-b-c"
    assert normalize_slug("-abc-") == "abc"


@pytest.mark.parametrize("raw", ["é", "", "ab", "x" * 41, "---"])
def test_normalize_rejects(raw):
    with pytest.raises(ValueError):
        normalize_slug(raw)


def test_reserved():
    for s in ("admin", "preview", "slug-check", "_next", "pricing", "docs"):
        assert is_reserved(s)
    assert not is_reserved("sj-interiors")


def test_claim_reserved_422(db):
    biz = make_business(db)
    with pytest.raises(HTTPException) as e:
        claim_slug(db, biz, "Admin")
    assert e.value.status_code == 422


def test_claim_twice_409(db):
    a, b = make_business(db), make_business(db)
    assert claim_slug(db, a, "studio-x") == "studio-x"
    with pytest.raises(HTTPException) as e:
        claim_slug(db, b, "studio-x")
    assert e.value.status_code == 409


def test_claim_conflict_across_scoped_sessions(db):
    a, b = make_business(db), make_business(db)
    claim_slug(db, a, "studio-y")
    as_business(db, b.id)  # RLS hides a's row; unique index must catch it
    b = db.get(Business, b.id)
    with pytest.raises(HTTPException) as e:
        claim_slug(db, b, "studio-y")
    assert e.value.status_code == 409


def test_rename_keeps_alias(db):
    a, b = make_business(db), make_business(db)
    claim_slug(db, a, "old-name")
    claim_slug(db, a, "new-name")
    as_owner(db)
    assert resolve_slug(db, "old-name") == (a, True)
    assert resolve_slug(db, "new-name") == (a, False)
    assert resolve_slug(db, "nope-nope") is None
    with pytest.raises(HTTPException) as e:
        claim_slug(db, b, "old-name")
    assert e.value.status_code == 409


def test_reclaim_own_old_slug(db):
    a = make_business(db)
    claim_slug(db, a, "first-one")
    claim_slug(db, a, "second-one")
    claim_slug(db, a, "first-one")
    assert resolve_slug(db, "first-one") == (a, False)
    assert resolve_slug(db, "second-one") == (a, True)


def test_alias_policy_registered():
    from ..rls import _POLICIES

    assert _POLICIES["slug_aliases"] == "true"


def test_scoped_session_sees_foreign_aliases_and_renames(db):
    from sqlalchemy import select, text

    from ..models import SlugAlias

    a, b = make_business(db), make_business(db)
    claim_slug(db, a, "alpha-one")
    claim_slug(db, a, "alpha-two")  # alias alpha-one belongs to a
    as_business(db, b.id)
    assert db.scalar(text("SELECT current_user")) == "portal_app"
    assert db.scalar(select(SlugAlias).where(SlugAlias.slug == "alpha-one"))
    b = db.get(Business, b.id)
    with pytest.raises(HTTPException) as e:
        claim_slug(db, b, "alpha-one")
    assert e.value.status_code == 409
    claim_slug(db, b, "beta-one")
    claim_slug(db, b, "beta-two")  # alias insert under RLS must succeed
    assert db.scalar(select(SlugAlias).where(SlugAlias.slug == "beta-one"))
