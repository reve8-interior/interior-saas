"""get_user_allow_expired loads the user and business in one query."""

from sqlalchemy import event

from backend.models.user import UserRole
from backend.routers.deps import get_user_allow_expired

from .conftest import as_owner, auth, make_business, make_user

URL = "/api/v1/ai/models"


def test_business_is_eager_loaded_with_the_user(api, db):
    biz = make_business(db)
    user = make_user(db, role=UserRole.designer, business=biz)
    db.flush()
    db.expunge_all()
    as_owner(db)

    statements: list[str] = []

    def record(conn, cursor, statement, *rest):
        statements.append(statement)

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", record)
    try:
        token = auth(user)["Authorization"].removeprefix("Bearer ")
        loaded = get_user_allow_expired(token=token, db=db)
        after_load = len(statements)
        # Touching the relationship must not trigger a lazy-load query.
        assert loaded.business.id == biz.id
        assert len(statements) == after_load
    finally:
        event.remove(engine, "before_cursor_execute", record)

    user_selects = [s for s in statements if "FROM users" in s]
    assert len(user_selects) == 1
    assert "businesses" in user_selects[0]


def test_deactivated_business_is_rejected(api, db):
    biz = make_business(db, is_active=False)
    user = make_user(db, role=UserRole.designer, business=biz)
    as_owner(db)
    r = api.get(URL, headers=auth(user))
    assert r.status_code == 403
    assert "deactivated" in r.json()["detail"].lower()


def test_inactive_user_is_rejected(api, db):
    user = make_user(
        db,
        role=UserRole.designer,
        business=make_business(db),
        is_active=False,
    )
    as_owner(db)
    assert api.get(URL, headers=auth(user)).status_code == 401


def test_unknown_user_is_rejected(api, db):
    user = make_user(db, role=UserRole.designer, business=make_business(db))
    headers = auth(user)
    db.delete(user)
    db.flush()
    assert api.get(URL, headers=headers).status_code == 401


def test_garbage_token_is_rejected(api):
    r = api.get(URL, headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


def test_superadmin_without_business_is_allowed(api, db):
    owner = make_user(db, role=UserRole.superadmin)
    assert api.get(URL, headers=auth(owner)).status_code == 200
