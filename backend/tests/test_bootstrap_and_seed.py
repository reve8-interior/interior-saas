from sqlalchemy import select

from backend.core import bootstrap
from backend.models.client import Client
from backend.models.user import User, UserRole
from backend.seed_demo import _reset_all_demo_clients, _resolve_business_admin

from .conftest import (
    as_business,
    as_owner,
    make_business,
    make_client_row,
    make_user,
)


def use_session(
    monkeypatch, db, email="root@platform.com", password="pw123456"
):
    monkeypatch.setattr(bootstrap, "SessionLocal", lambda: db)
    monkeypatch.setattr(bootstrap.settings, "initial_admin_email", email)
    monkeypatch.setattr(bootstrap.settings, "initial_admin_password", password)


# ── bootstrap ──────────────────────────────────────────────────────────────
def test_bootstrap_creates_superadmin_without_business(db, monkeypatch):
    use_session(monkeypatch, db)
    bootstrap.bootstrap_admin()
    user = db.scalars(
        select(User).where(User.email == "root@platform.com")
    ).one()
    assert user.role == UserRole.superadmin
    assert user.business_id is None
    assert user.full_name == "Super Admin"


def test_bootstrap_promotes_existing_user(db, monkeypatch):
    make_user(db, role=UserRole.admin, email="root@platform.com")
    use_session(monkeypatch, db)
    bootstrap.bootstrap_admin()
    user = db.scalars(
        select(User).where(User.email == "root@platform.com")
    ).one()
    assert user.role == UserRole.superadmin


def test_bootstrap_is_idempotent(db, monkeypatch):
    use_session(monkeypatch, db)
    bootstrap.bootstrap_admin()
    bootstrap.bootstrap_admin()
    users = db.scalars(
        select(User).where(User.email == "root@platform.com")
    ).all()
    assert len(users) == 1


def test_bootstrap_skipped_without_credentials(db, monkeypatch):
    use_session(monkeypatch, db, email="", password="")
    bootstrap.bootstrap_admin()
    assert db.scalars(select(User).where(User.email == "")).all() == []


# ── seed_demo business targeting ───────────────────────────────────────────
def test_resolve_business_is_case_insensitive_and_prefers_admin(db):
    biz = make_business(db, "SJ Interiors")
    make_user(db, role=UserRole.designer, business=biz, email="d@sj.com")
    admin = make_user(db, role=UserRole.admin, business=biz, email="a@sj.com")
    found, who = _resolve_business_admin(db, "sj interiors")
    assert found.id == biz.id
    assert who.id == admin.id


def test_resolve_business_falls_back_to_first_user(db):
    biz = make_business(db, "Only Designer")
    designer = make_user(db, business=biz)
    _, who = _resolve_business_admin(db, "Only Designer")
    assert who.id == designer.id


def test_resolve_business_without_users(db):
    biz = make_business(db, "Empty")
    found, who = _resolve_business_admin(db, "Empty")
    assert found.id == biz.id
    assert who is None


def test_resolve_unknown_business(db):
    assert _resolve_business_admin(db, "Nope") == (None, None)


def demo_name():
    from backend.seed_demo import DEMO_CLIENTS

    return DEMO_CLIENTS[0]["name"]


def test_unscoped_reset_only_touches_businessless_demo_clients(db):
    biz = make_business(db)
    as_business(db, biz.id)
    make_client_row(db, demo_name())
    as_owner(db)
    orphan = make_client_row(db, demo_name())
    _reset_all_demo_clients(db)
    remaining = db.scalars(select(Client.id)).all()
    assert orphan.id not in remaining
    assert len(remaining) == 1


def test_scoped_reset_is_confined_to_that_business(db):
    a, b = make_business(db), make_business(db)
    as_business(db, a.id)
    make_client_row(db, demo_name())
    as_business(db, b.id)
    make_client_row(db, demo_name())
    as_business(db, a.id)
    _reset_all_demo_clients(db)
    as_owner(db)
    left = db.scalars(select(Client)).all()
    assert [c.business_id for c in left] == [b.id]
