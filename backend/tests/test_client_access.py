"""Admins decide which clients each designer can see."""

from backend.models.user import UserRole

from .conftest import auth, make_business, make_client_row, make_user


def setup(db):
    biz = make_business(db)
    admin = make_user(db, role=UserRole.admin, business=biz)
    ann = make_user(db, role=UserRole.designer, business=biz)
    bob = make_user(db, role=UserRole.designer, business=biz)
    return biz, admin, ann, bob


def names(api, user) -> set[str]:
    r = api.get("/api/v1/clients", headers=auth(user))
    assert r.status_code == 200
    return {c["name"] for c in r.json()}


def test_designer_sees_only_led_or_shared_clients(api, db):
    biz, admin, ann, bob = setup(db)
    make_client_row(db, "Led", business_id=biz.id, assigned_designer_id=ann.id)
    shared = make_client_row(db, "Shared", business_id=biz.id)
    make_client_row(db, "Other", business_id=biz.id)
    assert names(api, ann) == {"Led"}
    r = api.put(
        f"/api/v1/clients/{shared.id}/access",
        headers=auth(admin),
        json={"member_ids": [str(ann.id)]},
    )
    assert r.status_code == 200
    assert names(api, ann) == {"Led", "Shared"}
    assert names(api, bob) == set()
    assert names(api, admin) == {"Led", "Shared", "Other"}


def test_shared_client_is_fully_reachable(api, db):
    biz, admin, ann, _ = setup(db)
    c = make_client_row(db, "Shared", business_id=biz.id)
    url = f"/api/v1/clients/{c.id}"
    assert api.get(url, headers=auth(ann)).status_code == 404
    api.put(
        f"{url}/access",
        headers=auth(admin),
        json={"member_ids": [str(ann.id)]},
    )
    assert api.get(url, headers=auth(ann)).status_code == 200
    # revoking removes it again
    api.put(f"{url}/access", headers=auth(admin), json={"member_ids": []})
    assert api.get(url, headers=auth(ann)).status_code == 404


def test_member_centric_assignment(api, db):
    biz, admin, ann, _ = setup(db)
    a = make_client_row(db, "A", business_id=biz.id)
    make_client_row(db, "B", business_id=biz.id)
    r = api.put(
        f"/api/v1/team/{ann.id}/clients",
        headers=auth(admin),
        json={"client_ids": [str(a.id)]},
    )
    assert r.status_code == 200
    assert r.json()["shared_ids"] == [str(a.id)]
    assert names(api, ann) == {"A"}
    got = api.get(f"/api/v1/team/{ann.id}/clients", headers=auth(admin))
    assert got.json()["shared_ids"] == [str(a.id)]


def test_only_admins_manage_access(api, db):
    biz, admin, ann, bob = setup(db)
    c = make_client_row(
        db, "C", business_id=biz.id, assigned_designer_id=ann.id
    )
    body = {"member_ids": [str(bob.id)]}
    assert (
        api.put(
            f"/api/v1/clients/{c.id}/access", headers=auth(ann), json=body
        ).status_code
        == 403
    )
    assert (
        api.put(
            f"/api/v1/team/{bob.id}/clients",
            headers=auth(ann),
            json={"client_ids": []},
        ).status_code
        == 403
    )


def test_access_only_to_own_business_designers(api, db):
    biz, admin, ann, _ = setup(db)
    stranger = make_user(
        db, role=UserRole.designer, business=make_business(db)
    )
    viewer = make_user(db, role=UserRole.viewer, business=biz)
    c = make_client_row(db, "C", business_id=biz.id)
    for bad in (stranger, viewer, admin):
        r = api.put(
            f"/api/v1/clients/{c.id}/access",
            headers=auth(admin),
            json={"member_ids": [str(bad.id)]},
        )
        assert r.status_code == 422, bad.role


def test_designer_created_client_is_theirs_and_cannot_reassign(api, db):
    biz, admin, ann, bob = setup(db)
    r = api.post(
        "/api/v1/clients",
        headers=auth(ann),
        json={"name": "Mine", "assigned_designer_id": str(bob.id)},
    )
    assert r.status_code == 201
    assert r.json()["assigned_designer_id"] == str(ann.id)
    assert names(api, ann) == {"Mine"}
    r = api.put(
        f"/api/v1/clients/{r.json()['id']}",
        headers=auth(ann),
        json={"assigned_designer_id": str(bob.id)},
    )
    assert r.status_code == 403


def test_admin_reassigns_lead_and_invalid_assignee_rejected(api, db):
    biz, admin, ann, bob = setup(db)
    other = make_user(db, role=UserRole.designer, business=make_business(db))
    c = make_client_row(
        db, "C", business_id=biz.id, assigned_designer_id=ann.id
    )
    url = f"/api/v1/clients/{c.id}"
    ok = api.put(
        url, headers=auth(admin), json={"assigned_designer_id": str(bob.id)}
    )
    assert ok.status_code == 200
    assert names(api, bob) == {"C"} and names(api, ann) == set()
    bad = api.put(
        url, headers=auth(admin), json={"assigned_designer_id": str(other.id)}
    )
    assert bad.status_code == 422


def test_access_changes_are_audited(api, db):
    biz, admin, ann, _ = setup(db)
    c = make_client_row(db, "C", business_id=biz.id)
    api.put(
        f"/api/v1/clients/{c.id}/access",
        headers=auth(admin),
        json={"member_ids": [str(ann.id)]},
    )
    page = api.get(
        "/api/v1/team/audit?action=access", headers=auth(admin)
    ).json()
    assert page["total"] == 1
    assert page["items"][0]["payload"]["granted"] == 1
