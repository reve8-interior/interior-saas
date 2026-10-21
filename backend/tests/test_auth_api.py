from backend.models.user import UserRole

from .conftest import PASSWORD, auth, make_business, make_user

LOGIN = "/api/v1/auth/login"
ADMIN_LOGIN = "/api/v1/auth/admin/login"
CHANGE_PW = "/api/v1/auth/change-password"


def creds(user, password=PASSWORD):
    return {"email": user.email, "password": password}


def test_business_user_can_log_in(api, db):
    user = make_user(db, business=make_business(db))
    r = api.post(LOGIN, json=creds(user))
    assert r.status_code == 200
    assert r.json()["role"] == "designer"


def test_wrong_password_rejected(api, db):
    user = make_user(db, business=make_business(db))
    assert api.post(LOGIN, json=creds(user, "nope-nope")).status_code == 401


def test_unknown_email_rejected(api):
    r = api.post(LOGIN, json={"email": "x@y.com", "password": "whatever1"})
    assert r.status_code == 401


def test_superadmin_cannot_use_portal_login(api, db):
    sa = make_user(db, role=UserRole.superadmin)
    r = api.post(LOGIN, json=creds(sa))
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid credentials"


def test_business_user_cannot_use_admin_login(api, db):
    user = make_user(db, role=UserRole.admin, business=make_business(db))
    r = api.post(ADMIN_LOGIN, json=creds(user))
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid credentials"


def test_superadmin_admin_login(api, db):
    sa = make_user(db, role=UserRole.superadmin)
    r = api.post(ADMIN_LOGIN, json=creds(sa))
    assert r.status_code == 200
    assert r.json()["role"] == "superadmin"


def test_deactivated_business_blocks_login_and_existing_tokens(api, db):
    business = make_business(db)
    user = make_user(db, business=business)
    token_headers = auth(user)
    business.is_active = False
    db.flush()
    assert api.post(LOGIN, json=creds(user)).status_code == 403
    assert api.get("/api/v1/auth/me", headers=token_headers).status_code == 403


def test_disabled_user_blocked(api, db):
    user = make_user(db, business=make_business(db), is_active=False)
    assert api.post(LOGIN, json=creds(user)).status_code == 403


def test_me_includes_business_name(api, db):
    business = make_business(db, "SJ Interiors")
    user = make_user(db, business=business, full_name="Sam")
    body = api.get("/api/v1/auth/me", headers=auth(user)).json()
    assert body["business_name"] == "SJ Interiors"
    assert body["full_name"] == "Sam"


def test_me_for_superadmin_has_no_business(api, db):
    sa = make_user(db, role=UserRole.superadmin)
    body = api.get("/api/v1/auth/me", headers=auth(sa)).json()
    assert body["business_name"] is None


def test_me_requires_token(api):
    assert api.get("/api/v1/auth/me").status_code == 401
    bad = {"Authorization": "Bearer junk"}
    assert api.get("/api/v1/auth/me", headers=bad).status_code == 401


def test_update_profile(api, db):
    user = make_user(db, business=make_business(db))
    r = api.patch(
        "/api/v1/auth/me",
        headers=auth(user),
        json={"full_name": "  New Name "},
    )
    assert r.status_code == 200
    assert r.json()["full_name"] == "New Name"


def test_update_profile_rejects_blank(api, db):
    user = make_user(db, business=make_business(db))
    r = api.patch(
        "/api/v1/auth/me", headers=auth(user), json={"full_name": ""}
    )
    assert r.status_code == 422


def test_change_password_flow(api, db):
    user = make_user(db, business=make_business(db))
    r = api.post(
        CHANGE_PW,
        headers=auth(user),
        json={"current_password": PASSWORD, "new_password": "brand-new-pass"},
    )
    assert r.status_code == 204
    assert api.post(LOGIN, json=creds(user)).status_code == 401
    assert (
        api.post(LOGIN, json=creds(user, "brand-new-pass")).status_code == 200
    )


def test_change_password_wrong_current(api, db):
    user = make_user(db, business=make_business(db))
    r = api.post(
        CHANGE_PW,
        headers=auth(user),
        json={
            "current_password": "wrong-pass1",
            "new_password": "brand-new-pass",
        },
    )
    assert r.status_code == 400


def test_change_password_must_differ_and_be_long_enough(api, db):
    user = make_user(db, business=make_business(db))
    same = api.post(
        CHANGE_PW,
        headers=auth(user),
        json={"current_password": PASSWORD, "new_password": PASSWORD},
    )
    short = api.post(
        CHANGE_PW,
        headers=auth(user),
        json={"current_password": PASSWORD, "new_password": "short"},
    )
    assert same.status_code == 400
    assert short.status_code == 422


def _expires_in(business, **delta):
    from datetime import UTC, datetime, timedelta

    business.access_expires_at = datetime.now(UTC) + timedelta(**delta)


def test_me_reports_days_left(api, db):
    business = make_business(db)
    _expires_in(business, days=5, hours=1)
    user = make_user(db, business=business)
    access = api.get("/api/v1/auth/me", headers=auth(user)).json()["access"]
    assert access["days_left"] == 6
    assert access["expired"] is False


def test_expired_business_blocked_but_can_read_me(api, db):
    business = make_business(db)
    _expires_in(business, days=-1)
    user = make_user(db, business=business)
    headers = auth(user)
    me = api.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["access"]["expired"] is True
    assert api.get("/api/v1/clients", headers=headers).status_code == 402


def test_no_expiry_means_unlimited(api, db):
    user = make_user(db, business=make_business(db))
    assert api.get("/api/v1/clients", headers=auth(user)).status_code == 200
