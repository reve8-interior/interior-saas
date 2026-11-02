"""Plan catalogue, effective limits, enforcement and the plans API."""

from backend.models.plan import Plan
from backend.models.user import UserRole
from backend.schemas.plan import PlanCreate, PlanUpdate
from backend.services.plan_catalog import DEFAULTS_BY_SLUG
from backend.services.plan_limits import (
    effective_limits,
    ensure_plan_exists,
    get_plan,
    seed_plans,
)

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from .conftest import (
    as_business,
    as_owner,
    auth,
    make_business,
    make_client_row,
    make_user,
)

PLANS = "/api/v1/plans"
ADMIN_PLANS = "/api/v1/admin/plans"


def superadmin(db):
    return make_user(db, role=UserRole.superadmin)


# --- schemas -----------------------------------------------------------------


def test_plan_create_normalises_slug_and_highlights():
    plan = PlanCreate(
        slug=" Team_X ", name="Team", highlights=["  one ", "", "two"]
    )
    assert plan.slug == "team_x"
    assert plan.highlights == ["one", "two"]


@pytest.mark.parametrize("slug", ["", "a", "Has Space", "9lives", "x" * 40])
def test_plan_create_rejects_bad_slugs(slug):
    with pytest.raises(ValidationError):
        PlanCreate(slug=slug, name="X")


def test_plan_limits_reject_negative_values():
    with pytest.raises(ValidationError):
        PlanCreate(slug="bad", name="Bad", max_clients=-1)


def test_plan_update_forbids_unknown_fields():
    with pytest.raises(ValidationError):
        PlanUpdate(slug="renamed")


# --- catalogue and effective limits -----------------------------------------


def test_seed_inserts_missing_plans_once_and_keeps_edits(db):
    seed_plans(db)
    assert db.query(Plan).count() == len(DEFAULTS_BY_SLUG)
    db.query(Plan).filter_by(slug="solo").one().max_clients = 99
    db.flush()
    assert seed_plans(db) == 0
    assert db.query(Plan).filter_by(slug="solo").one().max_clients == 99


def test_unseeded_plan_falls_back_to_built_in_defaults(db):
    assert get_plan(db, "solo").max_clients == 25
    assert get_plan(db, "no_such_plan").name == "Free"


def test_website_fields_are_reserved_but_off(db):
    for default in DEFAULTS_BY_SLUG.values():
        assert default.website_enabled is False
        assert default.website_max_pages == 0


def test_business_override_beats_plan_and_null_follows_plan(db):
    biz = make_business(db, plan="solo", max_clients=2)
    limits = effective_limits(db, biz)
    assert limits.max_clients == 2
    assert limits.max_users == DEFAULTS_BY_SLUG["solo"].max_users


def test_unlimited_when_plan_value_is_null(db):
    assert (
        effective_limits(db, make_business(db, plan="studio")).max_clients
        is None
    )


def test_ensure_plan_exists(db):
    ensure_plan_exists(db, "studio_pro")
    ensure_plan_exists(db, "pro")
    with pytest.raises(HTTPException) as err:
        ensure_plan_exists(db, "ghost")
    assert err.value.status_code == 422


# --- enforcement -------------------------------------------------------------


def _admin_in(db, **biz_kw):
    biz = make_business(db, **biz_kw)
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    return biz, user


def test_client_creation_blocked_at_plan_limit(api, db):
    _, user = _admin_in(db, plan="free", max_clients=1)
    ok = api.post("/api/v1/clients", headers=auth(user), json={"name": "A"})
    assert ok.status_code == 201
    blocked = api.post(
        "/api/v1/clients", headers=auth(user), json={"name": "B"}
    )
    assert blocked.status_code == 403
    assert "active clients" in blocked.json()["detail"]


def test_archived_clients_do_not_count(api, db):
    _, user = _admin_in(db, plan="free", max_clients=1)
    make_client_row(db, "old", is_active=False)
    r = api.post("/api/v1/clients", headers=auth(user), json={"name": "A"})
    assert r.status_code == 201


def test_client_creation_unlimited_on_studio(api, db):
    _, user = _admin_in(db, plan="studio")
    for i in range(5):
        r = api.post(
            "/api/v1/clients", headers=auth(user), json={"name": f"C{i}"}
        )
        assert r.status_code == 201


def test_me_returns_limits_and_usage(api, db):
    _, user = _admin_in(db, plan="free")
    make_client_row(db, "A")
    body = api.get("/api/v1/auth/me", headers=auth(user)).json()
    assert body["limits"]["plan"] == "free"
    clients = next(m for m in body["usage"] if m["key"] == "clients")
    assert clients == {
        "key": "clients",
        "label": "Active clients",
        "used": 1,
        "limit": DEFAULTS_BY_SLUG["free"].max_clients,
    }


# --- public + admin API ------------------------------------------------------


def test_public_plans_need_no_login_and_hide_private_ones(api, db):
    seed_plans(db)
    db.query(Plan).filter_by(slug="solo").one().is_public = False
    db.flush()
    r = api.get(PLANS)
    assert r.status_code == 200
    slugs = [p["slug"] for p in r.json()]
    assert slugs == ["free", "studio", "studio_pro"]
    assert "id" not in r.json()[0]


def test_admin_plans_require_superadmin(api, db):
    _, user = _admin_in(db)
    assert api.get(ADMIN_PLANS, headers=auth(user)).status_code == 403
    assert api.get(ADMIN_PLANS).status_code in (401, 403)


def test_admin_can_create_edit_and_delete_a_plan(api, db):
    admin = superadmin(db)
    created = api.post(
        ADMIN_PLANS,
        headers=auth(admin),
        json={"slug": "agency", "name": "Agency", "max_clients": 100},
    )
    assert created.status_code == 201
    plan_id = created.json()["id"]

    dup = api.post(
        ADMIN_PLANS, headers=auth(admin), json={"slug": "agency", "name": "X"}
    )
    assert dup.status_code == 409

    edited = api.patch(
        f"{ADMIN_PLANS}/{plan_id}",
        headers=auth(admin),
        json={"max_clients": None, "price_monthly_inr": 4999},
    )
    assert edited.status_code == 200
    assert edited.json()["max_clients"] is None
    assert edited.json()["price_monthly_inr"] == 4999

    assert (
        api.delete(f"{ADMIN_PLANS}/{plan_id}", headers=auth(admin)).status_code
        == 204
    )


def test_cannot_delete_a_plan_in_use(api, db):
    admin = superadmin(db)
    seed_plans(db)
    make_business(db, plan="solo")
    solo = db.query(Plan).filter_by(slug="solo").one()
    r = api.delete(f"{ADMIN_PLANS}/{solo.id}", headers=auth(admin))
    assert r.status_code == 409


def test_only_one_plan_is_recommended(api, db):
    admin = superadmin(db)
    seed_plans(db)
    solo = db.query(Plan).filter_by(slug="solo").one()
    r = api.patch(
        f"{ADMIN_PLANS}/{solo.id}",
        headers=auth(admin),
        json={"is_recommended": True},
    )
    assert r.status_code == 200
    as_owner(db)
    flagged = [p.slug for p in db.query(Plan).filter_by(is_recommended=True)]
    assert flagged == ["solo"]


def test_assigning_an_unknown_plan_to_a_business_is_rejected(api, db):
    admin = superadmin(db)
    biz = make_business(db)
    r = api.patch(
        f"/api/v1/businesses/{biz.id}",
        headers=auth(admin),
        json={"plan": "ghost"},
    )
    assert r.status_code == 422
