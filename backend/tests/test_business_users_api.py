from sqlalchemy import select

from backend.models.user import User, UserRole

from .conftest import auth, make_business, make_user

LOGIN = "/api/v1/auth/login"


def url(biz, suffix: str = "") -> str:
    return f"/api/v1/businesses/{biz.id}/users{suffix}"


def superadmin(db):
    return auth(make_user(db, role=UserRole.superadmin))


def test_requires_superadmin(api, db):
    biz = make_business(db)
    admin = make_user(db, role=UserRole.admin, business=biz)
    assert api.get(url(biz)).status_code == 401
    assert api.get(url(biz), headers=auth(admin)).status_code == 403
    r = api.post(
        url(biz, f"/{admin.id}/reset-password"), headers=auth(admin), json={}
    )
    assert r.status_code == 403


def test_create_user_then_login_and_forced_change(api, db):
    biz = make_business(db)
    r = api.post(
        url(biz),
        headers=superadmin(db),
        json={"email": "Owner@Biz.com", "password": "temp-pass-123"},
    )
    assert r.status_code == 201
    assert r.json()["email"] == "owner@biz.com"
    assert r.json()["must_change_password"] is True
    # login is case-insensitive
    login = api.post(
        LOGIN, json={"email": "OWNER@biz.com", "password": "temp-pass-123"}
    )
    assert login.status_code == 200
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    # blocked until the password is changed, but /me and change-password work
    assert api.get("/api/v1/clients", headers=h).status_code == 403
    assert api.get("/api/v1/auth/me", headers=h).json()["must_change_password"]
    done = api.post(
        "/api/v1/auth/change-password",
        headers=h,
        json={
            "current_password": "temp-pass-123",
            "new_password": "brand-new-1",
        },
    )
    assert done.status_code == 204
    assert api.get("/api/v1/clients", headers=h).status_code != 403


def test_duplicate_email_conflict_is_case_insensitive(api, db):
    biz = make_business(db)
    make_user(db, business=biz, email="taken@x.com")
    r = api.post(
        url(biz),
        headers=superadmin(db),
        json={"email": "TAKEN@x.com", "password": "temp-pass-123"},
    )
    assert r.status_code == 409


def test_edit_email_and_deactivate(api, db):
    biz = make_business(db)
    user = make_user(
        db, business=biz, email="old@x.com", password="pw-12345678"
    )
    h = superadmin(db)
    r = api.patch(
        url(biz, f"/{user.id}"),
        headers=h,
        json={"email": "new@x.com", "full_name": "New Name"},
    )
    assert r.status_code == 200
    assert r.json()["email"] == "new@x.com"
    ok = api.post(
        LOGIN, json={"email": "new@x.com", "password": "pw-12345678"}
    )
    assert ok.status_code == 200
    r = api.patch(
        url(biz, f"/{user.id}"), headers=h, json={"is_active": False}
    )
    assert r.json()["is_active"] is False
    off = api.post(
        LOGIN, json={"email": "new@x.com", "password": "pw-12345678"}
    )
    assert off.status_code == 403


def test_edit_email_to_existing_conflicts(api, db):
    biz = make_business(db)
    make_user(db, business=biz, email="a@x.com")
    other = make_user(db, business=biz, email="b@x.com")
    r = api.patch(
        url(biz, f"/{other.id}"),
        headers=superadmin(db),
        json={"email": "a@x.com"},
    )
    assert r.status_code == 409


def test_reset_password_generated_and_explicit(api, db):
    biz = make_business(db)
    user = make_user(
        db, business=biz, email="u@x.com", password="old-pass-123"
    )
    h = superadmin(db)
    r = api.post(url(biz, f"/{user.id}/reset-password"), headers=h, json={})
    assert r.status_code == 200
    generated = r.json()["temporary_password"]
    assert len(generated) >= 12
    assert (
        api.post(
            LOGIN, json={"email": "u@x.com", "password": "old-pass-123"}
        ).status_code
        == 401
    )
    assert (
        api.post(
            LOGIN, json={"email": "u@x.com", "password": generated}
        ).status_code
        == 200
    )
    db.refresh(user)
    assert user.must_change_password is True

    r = api.post(
        url(biz, f"/{user.id}/reset-password"),
        headers=h,
        json={"password": "chosen-pass-9"},
    )
    assert r.json()["temporary_password"] == "chosen-pass-9"
    short = api.post(
        url(biz, f"/{user.id}/reset-password"),
        headers=h,
        json={"password": "x"},
    )
    assert short.status_code == 422


def test_user_of_other_business_is_404(api, db):
    biz, other_biz = make_business(db), make_business(db)
    user = make_user(db, business=other_biz)
    r = api.post(
        url(biz, f"/{user.id}/reset-password"), headers=superadmin(db), json={}
    )
    assert r.status_code == 404


def test_list_users(api, db):
    biz = make_business(db)
    make_user(db, business=biz, email="l@x.com")
    r = api.get(url(biz), headers=superadmin(db))
    assert [u["email"] for u in r.json()] == ["l@x.com"]
    assert db.scalars(select(User).where(User.email == "l@x.com")).one()
