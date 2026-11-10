"""Plan catalogue, effective limits, enforcement and the plans API."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

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
from backend.services.site_access import site_mode

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


WEBSITE_FLAGS = {
    "free": (False, 0, False, False),
    "solo": (True, 1, False, False),
    "studio": (True, 1, True, False),
    "studio_pro": (True, 1, True, True),
}


@pytest.mark.parametrize("slug", WEBSITE_FLAGS)
def test_seeded_website_flags_per_plan(slug):
    plan = DEFAULTS_BY_SLUG[slug]
    assert (
        plan.website_enabled,
        plan.website_templates,
        plan.website_custom_domain,
        plan.website_remove_badge,
    ) == WEBSITE_FLAGS[slug]
    assert plan.website_max_pages == 0


def test_site_mode_follows_plan(db):
    assert site_mode(db, make_business(db, plan="free")) == "gallery"
    assert site_mode(db, make_business(db, plan="solo")) == "site"
    assert site_mode(db, make_business(db, plan="pro")) == "site"


@pytest.mark.parametrize(
    ("plan", "delta", "expected"),
    [
        ("solo", timedelta(days=-1), "gallery"),
        ("solo", timedelta(days=1), "site"),
        ("solo", None, "site"),
        ("free", timedelta(days=1), "gallery"),
    ],
)
def test_site_mode_respects_access_expiry(db, plan, delta, expected):
    expires = None if delta is None else datetime.now(UTC) + delta
    biz = make_business(db, plan=plan, access_expires_at=expires)
    assert site_mode(db, biz) == expected


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


def test_active_clients_lead_the_usage_list(api, db):
    _, user = _admin_in(db, plan="free")
    body = api.get("/api/v1/auth/me", headers=auth(user)).json()
    assert [m["key"] for m in body["usage"]][0] == "clients"
    assert {m["key"] for m in body["usage"]} == {
        "clients",
        "users",
        "images",
        "portfolio",
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


def test_pricing_visibility_defaults_to_shown(api, db):
    admin = superadmin(db)
    r = api.get(f"{ADMIN_PLANS}/visibility", headers=auth(admin))
    assert r.status_code == 200
    assert r.json() == {"show_pricing": True}


def test_hiding_pricing_empties_public_plans_and_can_be_undone(api, db):
    admin = superadmin(db)
    assert api.get(PLANS).json() != []

    off = api.put(
        f"{ADMIN_PLANS}/visibility",
        headers=auth(admin),
        json={"show_pricing": False},
    )
    assert off.status_code == 200
    assert off.json() == {"show_pricing": False}
    assert api.get(PLANS).json() == []
    assert api.get(
        f"{ADMIN_PLANS}/visibility", headers=auth(admin)
    ).json() == {"show_pricing": False}

    api.put(
        f"{ADMIN_PLANS}/visibility",
        headers=auth(admin),
        json={"show_pricing": True},
    )
    assert api.get(PLANS).json() != []


def test_pricing_visibility_requires_superadmin_and_a_boolean(api, db):
    _, user = _admin_in(db)
    body = {"show_pricing": False}
    url = f"{ADMIN_PLANS}/visibility"
    assert api.put(url, headers=auth(user), json=body).status_code == 403
    assert api.put(url, json=body).status_code in (401, 403)
    admin = superadmin(db)
    bad = api.put(url, headers=auth(admin), json={"show_pricing": "maybe"})
    assert bad.status_code == 422


def test_assigning_an_unknown_plan_to_a_business_is_rejected(api, db):
    admin = superadmin(db)
    biz = make_business(db)
    r = api.patch(
        f"/api/v1/businesses/{biz.id}",
        headers=auth(admin),
        json={"plan": "ghost"},
    )
    assert r.status_code == 422


def test_clients_over_the_limit_are_locked_oldest_stay_open(api, db):
    _, user = _admin_in(db, plan="free", max_clients=1)
    first = make_client_row(db, "first")
    second = make_client_row(db, "second")
    headers = auth(user)

    rows = {
        c["name"]: c["locked"]
        for c in api.get("/api/v1/clients", headers=headers).json()
    }
    assert rows == {"first": False, "second": True}
    assert (
        api.get(f"/api/v1/clients/{first.id}", headers=headers).status_code
        == 200
    )
    # Opening the locked client's workspace data is refused with an upgrade hint.
    blocked = api.get(f"/api/v1/clients/{second.id}/designs", headers=headers)
    assert blocked.status_code in (403, 404)
    # Its own record can still be read and archived, which frees a slot.
    got = api.get(f"/api/v1/clients/{second.id}", headers=headers).json()
    assert got["locked"] is True
    off = api.patch(f"/api/v1/clients/{first.id}/deactivate", headers=headers)
    assert off.status_code == 200
    assert (
        api.get(f"/api/v1/clients/{second.id}", headers=headers).json()[
            "locked"
        ]
        is False
    )


def test_lapsed_paid_plan_locks_extra_clients(api, db):
    from datetime import UTC, datetime, timedelta

    _, user = _admin_in(
        db,
        plan="solo",
        access_expires_at=datetime.now(UTC) - timedelta(days=1),
    )
    for i in range(5):
        make_client_row(db, f"c{i}")
    rows = api.get("/api/v1/clients", headers=auth(user)).json()
    assert sum(c["locked"] for c in rows) == 2  # Free allows 3


def test_portfolio_designs_over_the_limit_are_locked_and_hidden(api, db):
    from backend.models.design import Design, DesignSource

    biz, user = _admin_in(db, plan="free", max_portfolio_designs=1)
    client = make_client_row(db, "c")
    ds = []
    for i in range(2):
        d = Design(
            client_id=client.id,
            business_id=biz.id,
            source=DesignSource.designer_uploaded,
            title=f"d{i}",
            in_portfolio=True,
            portfolio_position=i,
        )
        db.add(d)
        ds.append(d)
    db.flush()
    headers = auth(user)

    rows = api.get("/api/v1/portfolio-designs", headers=headers).json()
    assert [(r["title"], r["locked"]) for r in rows] == [
        ("d0", False),
        ("d1", True),
    ]
    refused = api.post(
        "/api/v1/portfolio-shares",
        headers=headers,
        json={"design_ids": [str(ds[1].id)]},
    )
    assert refused.status_code == 403
