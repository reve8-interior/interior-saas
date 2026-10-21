"""Business-admin team management: seats, roles, safety rules, audit."""

from sqlalchemy import select

from backend.models.audit import AuditLog
from backend.models.user import User, UserRole

from .conftest import auth, make_business, make_client_row, make_user

TEAM = "/api/v1/team"


def new_member(email: str = "new@x.com", role: str = "designer") -> dict:
    return {"email": email, "password": "temp-pass-123", "role": role}


def setup_biz(db, **kw):
    biz = make_business(db, **kw)
    admin = make_user(db, role=UserRole.admin, business=biz)
    return biz, admin


def test_only_business_admins_can_manage_team(api, db):
    biz, admin = setup_biz(db)
    designer = make_user(db, role=UserRole.designer, business=biz)
    viewer = make_user(db, role=UserRole.viewer, business=biz)
    superadmin = make_user(db, role=UserRole.superadmin)
    assert api.get(TEAM).status_code == 401
    for user in (designer, viewer, superadmin):
        assert api.get(TEAM, headers=auth(user)).status_code == 403
    assert api.get(TEAM, headers=auth(admin)).status_code == 200


def test_admin_adds_member_within_seat_limit(api, db):
    biz, admin = setup_biz(db, max_users=2)
    h = auth(admin)
    r = api.post(TEAM, headers=h, json=new_member("a@x.com"))
    assert r.status_code == 201
    assert r.json()["role"] == "designer"
    assert r.json()["must_change_password"] is True

    full = api.post(TEAM, headers=h, json=new_member("b@x.com"))
    assert full.status_code == 409
    assert "limit" in full.json()["detail"].lower()

    overview = api.get(TEAM, headers=h).json()
    assert overview["seats_used"] == 2
    assert overview["max_users"] == 2
    assert overview["seats_left"] == 0


def test_unlimited_seats_when_max_users_null(api, db):
    biz, admin = setup_biz(db)
    biz.max_users = None
    db.flush()
    for i in range(3):
        r = api.post(TEAM, headers=auth(admin), json=new_member(f"u{i}@x.com"))
        assert r.status_code == 201
    assert api.get(TEAM, headers=auth(admin)).json()["seats_left"] is None


def test_disabling_frees_a_seat_and_enabling_rechecks(api, db):
    biz, admin = setup_biz(db, max_users=2)
    member = make_user(db, business=biz)
    h = auth(admin)
    off = api.patch(
        f"{TEAM}/{member.id}", headers=h, json={"is_active": False}
    )
    assert off.status_code == 200
    other = api.post(TEAM, headers=h, json=new_member("o@x.com"))
    assert other.status_code == 201
    back = api.patch(
        f"{TEAM}/{member.id}", headers=h, json={"is_active": True}
    )
    assert back.status_code == 409


def test_email_unique_across_platform(api, db):
    biz, admin = setup_biz(db)
    make_user(db, email="taken@x.com")
    r = api.post(TEAM, headers=auth(admin), json=new_member("TAKEN@x.com"))
    assert r.status_code == 409


def test_change_role_and_audit_diff(api, db):
    biz, admin = setup_biz(db)
    member = make_user(db, business=biz)
    r = api.patch(
        f"{TEAM}/{member.id}", headers=auth(admin), json={"role": "viewer"}
    )
    assert r.status_code == 200
    assert r.json()["role"] == "viewer"
    entries = api.get(f"{TEAM}/audit", headers=auth(admin)).json()["items"]
    updated = next(e for e in entries if e["action"] == "team.member_updated")
    assert updated["payload"]["changes"]["role"] == {
        "from": "designer",
        "to": "viewer",
    }
    assert updated["actor_email"] == admin.email


def test_cannot_demote_disable_remove_or_reset_self(api, db):
    biz, admin = setup_biz(db)
    make_user(db, role=UserRole.admin, business=biz)  # a second admin exists
    h = auth(admin)
    me = f"{TEAM}/{admin.id}"
    assert (
        api.patch(me, headers=h, json={"role": "designer"}).status_code == 400
    )
    assert (
        api.patch(me, headers=h, json={"is_active": False}).status_code == 400
    )
    assert api.delete(me, headers=h).status_code == 400
    assert (
        api.post(f"{me}/reset-password", headers=h, json={}).status_code == 400
    )


def test_business_keeps_one_active_admin(api, db):
    sup = auth(make_user(db, role=UserRole.superadmin))
    biz, admin = setup_biz(db)
    other = make_user(db, role=UserRole.admin, business=biz)
    h = auth(admin)
    # Two admins: demoting one is fine ...
    assert (
        api.patch(
            f"{TEAM}/{other.id}", headers=h, json={"role": "designer"}
        ).status_code
        == 200
    )
    # ... but the last one can't be removed by the platform admin either.
    url = f"/api/v1/businesses/{biz.id}/users/{admin.id}"
    assert api.delete(url, headers=sup).status_code == 409
    assert (
        api.patch(url, headers=sup, json={"is_active": False}).status_code
        == 409
    )


def test_remove_member_reassigns_clients_and_audits(api, db):
    biz, admin = setup_biz(db)
    member = make_user(db, business=biz)
    client = make_client_row(
        db, business_id=biz.id, assigned_designer_id=member.id
    )
    r = api.delete(f"{TEAM}/{member.id}", headers=auth(admin))
    assert r.status_code == 204
    assert db.get(User, member.id) is None
    db.refresh(client)
    assert client.assigned_designer_id == admin.id
    log = db.scalars(
        select(AuditLog).where(
            AuditLog.business_id == biz.id,
            AuditLog.action == "team.member_removed",
        )
    ).one()
    assert log.payload["clients_reassigned"] == 1


def test_cannot_touch_other_business_members(api, db):
    _, admin = setup_biz(db)
    other_biz = make_business(db)
    stranger = make_user(db, business=other_biz)
    h = auth(admin)
    assert (
        api.patch(
            f"{TEAM}/{stranger.id}", headers=h, json={"role": "viewer"}
        ).status_code
        == 404
    )
    assert api.delete(f"{TEAM}/{stranger.id}", headers=h).status_code == 404


def test_reset_password_returns_temp_once_and_forces_change(api, db):
    biz, admin = setup_biz(db)
    member = make_user(db, business=biz)
    r = api.post(
        f"{TEAM}/{member.id}/reset-password", headers=auth(admin), json={}
    )
    assert r.status_code == 200
    temp = r.json()["temporary_password"]
    assert len(temp) >= 8
    login = api.post(
        "/api/v1/auth/login", json={"email": member.email, "password": temp}
    )
    assert login.status_code == 200
    entries = api.get(f"{TEAM}/audit", headers=auth(admin)).json()["items"]
    assert temp not in str(entries)


def test_audit_scoped_to_business_and_filterable(api, db):
    biz, admin = setup_biz(db)
    other_biz, other_admin = setup_biz(db)
    api.post(TEAM, headers=auth(admin), json=new_member("a@x.com"))
    api.post(TEAM, headers=auth(other_admin), json=new_member("z@x.com"))
    page = api.get(f"{TEAM}/audit", headers=auth(admin)).json()
    assert page["total"] == 1
    assert "z@x.com" not in str(page)
    assert (
        api.get(f"{TEAM}/audit?action=auth", headers=auth(admin)).json()[
            "total"
        ]
        == 0
    )
    assert (
        api.get(f"{TEAM}/audit?action=team", headers=auth(admin)).json()[
            "total"
        ]
        == 1
    )


def test_login_records_audit_and_last_login(api, db):
    biz = make_business(db)
    user = make_user(db, role=UserRole.designer, business=biz)
    assert user.last_login_at is None
    r = api.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "correct-horse-1"},
    )
    assert r.status_code == 200
    db.refresh(user)
    assert user.last_login_at is not None
    sup = auth(make_user(db, role=UserRole.superadmin))
    page = api.get(f"/api/v1/businesses/{biz.id}/audit", headers=sup).json()
    assert [e["action"] for e in page["items"]] == ["auth.login"]


def test_viewer_is_read_only(api, db):
    biz = make_business(db)
    viewer = make_user(db, role=UserRole.viewer, business=biz)
    h = auth(viewer)
    assert api.get("/api/v1/clients", headers=h).status_code == 200
    r = api.post("/api/v1/clients", headers=h, json={"name": "X"})
    assert r.status_code == 403
    assert "read-only" in r.json()["detail"]
    # their own account still works
    r = api.patch("/api/v1/auth/me", headers=h, json={"full_name": "View Er"})
    assert r.status_code == 200


def test_superadmin_sets_seat_limit_and_it_binds_team_adds(api, db):
    biz, admin = setup_biz(db, max_users=5)
    sup = auth(make_user(db, role=UserRole.superadmin))
    r = api.patch(
        f"/api/v1/businesses/{biz.id}", headers=sup, json={"max_users": 1}
    )
    assert r.status_code == 200
    assert r.json()["max_users"] == 1
    assert r.json()["seats_used"] == 1
    blocked = api.post(TEAM, headers=auth(admin), json=new_member("n@x.com"))
    assert blocked.status_code == 409
    # unlimited again
    r = api.patch(
        f"/api/v1/businesses/{biz.id}", headers=sup, json={"max_users": None}
    )
    assert r.json()["max_users"] is None
    assert (
        api.post(
            TEAM, headers=auth(admin), json=new_member("n@x.com")
        ).status_code
        == 201
    )
    page = api.get(f"/api/v1/businesses/{biz.id}/audit", headers=sup).json()
    assert "business.updated" in [e["action"] for e in page["items"]]
