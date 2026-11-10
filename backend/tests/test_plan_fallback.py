"""Free plan never expires; a lapsed paid plan falls back to Free limits.

Covers the expiry rules, effective limits, and the locking of clients and
portfolio designs that sit over the (fallback) plan's limits.
"""

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from backend.models.design import Design, DesignSource
from backend.models.plan import Plan
from backend.models.portfolio_share import PortfolioShare
from backend.models.user import UserRole
from backend.services.plan_catalog import DEFAULTS_BY_SLUG, FREE_SLUG
from backend.services.plan_limits import (
    PORTFOLIO_LOCKED_DETAIL,
    effective_limits,
    locked_client_ids,
    locked_portfolio_ids,
    seed_plans,
    usage_summary,
)
from backend.services.site_access import site_mode
from backend.services.subscription import access_status, days_left, is_expired

from .conftest import (
    as_business,
    as_owner,
    auth,
    make_business,
    make_client_row,
    make_user,
)

FREE = DEFAULTS_BY_SLUG[FREE_SLUG]
BASE = datetime(2030, 1, 1, tzinfo=UTC)
NOW = datetime(2030, 6, 1, 12, 0, tzinfo=UTC)


def _past(**delta: int) -> datetime:
    return datetime.now(UTC) - timedelta(**delta)


def _future(**delta: int) -> datetime:
    return datetime.now(UTC) + timedelta(**delta)


def _biz(plan: str, expires_at: datetime | None) -> SimpleNamespace:
    """Just the fields the pure subscription helpers read."""
    return SimpleNamespace(
        plan=plan, access_expires_at=expires_at, warning_days=7
    )


def _admin_in(db, **biz_kw):
    biz = make_business(db, **biz_kw)
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    return biz, user


def _clients(db, count: int, **kw):
    """Active clients, oldest first, with strictly increasing created_at."""
    return [
        make_client_row(
            db, f"c{i}", created_at=BASE + timedelta(minutes=i), **kw
        )
        for i in range(count)
    ]


def _design(db, biz, client, position: int | None, **kw) -> Design:
    design = Design(
        id=uuid.uuid4(),
        business_id=biz.id,
        client_id=client.id,
        source=DesignSource.designer_uploaded,
        title=kw.pop("title", f"d{position}"),
        in_portfolio=kw.pop("in_portfolio", True),
        portfolio_position=position,
        **kw,
    )
    db.add(design)
    db.flush()
    return design


# --- expiry rules: Free never expires ----------------------------------------


@pytest.mark.parametrize(
    ("plan", "expires_at", "expected"),
    [
        ("free", _past(days=1), False),  # free never expires
        ("free", _past(days=3650), False),
        ("free", _future(days=1), False),
        ("free", None, False),
        ("solo", _past(seconds=1), True),
        ("studio", _past(days=1), True),
        ("studio_pro", _past(days=400), True),
        ("pro", _past(days=1), True),  # retired alias is still a paid plan
        ("solo", _future(days=1), False),
        ("solo", None, False),  # null expiry means no limit
    ],
)
def test_is_expired_matrix(plan, expires_at, expected):
    assert is_expired(_biz(plan, expires_at)) is expected


def test_is_expired_is_inclusive_at_the_exact_expiry_instant():
    business = _biz("solo", NOW)
    assert is_expired(business, now=NOW) is True
    assert is_expired(business, now=NOW - timedelta(microseconds=1)) is False
    assert is_expired(business, now=NOW + timedelta(seconds=1)) is True


def test_days_left_rounds_up_and_floors_at_zero():
    business = _biz("solo", NOW)
    assert days_left(business, now=NOW - timedelta(hours=1)) == 1
    assert days_left(business, now=NOW - timedelta(days=2, minutes=1)) == 3
    assert days_left(business, now=NOW) == 0
    assert days_left(business, now=NOW + timedelta(days=5)) == 0
    assert days_left(_biz("solo", None)) is None


def test_access_status_for_free_has_no_countdown_even_with_an_expiry():
    status = access_status(_biz("free", _past(days=1)))
    assert status.plan == "free"
    assert status.expired is False
    assert status.days_left is None
    assert status.expires_at is None


def test_access_status_for_free_with_future_expiry_has_no_countdown():
    status = access_status(_biz("free", _future(days=2)))
    assert status.days_left is None and status.expired is False


def test_access_status_for_paid_counts_down_then_expires():
    live = access_status(_biz("solo", _future(days=5, hours=1)))
    assert live.days_left == 6 and live.expired is False
    assert live.warning_days == 7
    gone = access_status(_biz("solo", _past(hours=1)))
    assert gone.expired is True and gone.days_left == 0


def test_access_status_for_paid_without_expiry_is_unlimited():
    status = access_status(_biz("studio", None))
    assert status.days_left is None and status.expired is False
    assert status.plan == "studio"


def test_access_status_without_a_business_is_the_empty_default():
    status = access_status(None)
    assert status.expired is False and status.days_left is None


# --- effective limits fall back to Free --------------------------------------


def test_lapsed_paid_plan_gets_exactly_the_free_limits(db):
    biz = make_business(db, plan="studio_pro", access_expires_at=_past(days=1))
    limits = effective_limits(db, biz)
    assert limits.plan == "free" and limits.plan_name == "Free"
    assert limits.max_clients == FREE.max_clients
    assert limits.max_users == FREE.max_users
    assert limits.max_images == FREE.max_images
    assert limits.max_portfolio_designs == FREE.max_portfolio_designs
    assert limits.max_quotation_versions == FREE.max_quotation_versions
    assert limits.website_enabled is False
    assert limits.clean_export is False
    assert limits.branded_export is False
    assert limits.ai_credits_monthly == FREE.ai_credits_monthly


def test_lapsed_plan_ignores_every_admin_override_and_ai_bonus(db):
    biz = make_business(
        db,
        plan="solo",
        access_expires_at=_past(hours=1),
        max_users=50,
        max_clients=500,
        max_quotation_versions=99,
        max_images=9999,
        max_image_mb=50,
        max_portfolio_designs=777,
        ai_credit_bonus=100,
    )
    limits = effective_limits(db, biz)
    assert limits.max_users == FREE.max_users
    assert limits.max_clients == FREE.max_clients
    assert limits.max_quotation_versions == FREE.max_quotation_versions
    assert limits.max_images == FREE.max_images
    assert limits.max_image_mb == FREE.max_image_mb
    assert limits.max_portfolio_designs == FREE.max_portfolio_designs
    assert limits.ai_credits_monthly == FREE.ai_credits_monthly


def test_live_paid_plan_keeps_overrides_and_ai_bonus(db):
    biz = make_business(
        db,
        plan="solo",
        access_expires_at=_future(days=3),
        max_clients=2,
        ai_credit_bonus=7,
    )
    limits = effective_limits(db, biz)
    assert limits.plan == "solo"
    assert limits.max_clients == 2
    assert (
        limits.ai_credits_monthly
        == DEFAULTS_BY_SLUG["solo"].ai_credits_monthly + 7
    )


def test_free_business_with_a_past_expiry_keeps_its_overrides(db):
    biz = make_business(
        db, plan="free", access_expires_at=_past(days=9), max_clients=5
    )
    limits = effective_limits(db, biz)
    assert limits.plan == "free" and limits.max_clients == 5


def test_lapsed_retired_pro_alias_falls_back_to_free(db):
    biz = make_business(db, plan="pro", access_expires_at=_past(days=1))
    assert effective_limits(db, biz).plan == "free"


def test_live_retired_pro_alias_still_resolves_to_studio(db):
    biz = make_business(db, plan="pro", access_expires_at=_future(days=1))
    assert effective_limits(db, biz).plan == "studio"


def test_lapsed_business_uses_the_admin_edited_free_plan_row(db):
    seed_plans(db)
    db.query(Plan).filter_by(slug="free").one().max_clients = 1
    db.flush()
    biz = make_business(db, plan="solo", access_expires_at=_past(days=1))
    assert effective_limits(db, biz).max_clients == 1


def test_lapsed_business_without_seeded_plans_still_gets_free(db):
    biz = make_business(db, plan="solo", access_expires_at=_past(days=1))
    assert effective_limits(db, biz).max_clients == FREE.max_clients


def test_a_business_exactly_at_expiry_is_already_on_free(db):
    # The instant it ends is expired (>=), so limits drop with it.
    biz = make_business(db, plan="solo", access_expires_at=_past(seconds=1))
    assert effective_limits(db, biz).plan == "free"


def test_renewing_restores_the_paid_limits(db):
    biz = make_business(
        db, plan="solo", access_expires_at=_past(days=1), max_clients=40
    )
    assert effective_limits(db, biz).max_clients == FREE.max_clients
    biz.access_expires_at = _future(days=30)
    assert effective_limits(db, biz).max_clients == 40


@pytest.mark.parametrize(
    ("plan", "expires", "mode"),
    [
        ("solo", None, "site"),
        ("solo", _future(days=1), "site"),
        ("solo", _past(days=1), "gallery"),
        ("studio_pro", _past(days=1), "gallery"),
        ("free", _past(days=1), "gallery"),
        ("free", None, "gallery"),
    ],
)
def test_website_mode_follows_the_fallback(db, plan, expires, mode):
    biz = make_business(db, plan=plan, access_expires_at=expires)
    assert site_mode(db, biz) == mode


def test_usage_summary_reports_against_free_limits_after_lapse(db):
    biz = make_business(db, plan="studio", access_expires_at=_past(days=1))
    meters = {m.key: m for m in usage_summary(db, biz)}
    assert meters["clients"].limit == FREE.max_clients
    assert meters["users"].limit == FREE.max_users
    assert meters["portfolio"].limit == FREE.max_portfolio_designs


# --- portal stays open after a lapse (no more 402) ---------------------------


def test_lapsed_paid_user_keeps_api_access_and_free_plan_in_me(api, db):
    _, user = _admin_in(db, plan="solo", access_expires_at=_past(days=2))
    headers = auth(user)
    assert api.get("/api/v1/clients", headers=headers).status_code == 200
    me = api.get("/api/v1/auth/me", headers=headers).json()
    assert me["access"]["expired"] is True
    assert me["limits"]["plan"] == "free"
    assert me["limits"]["max_clients"] == FREE.max_clients


def test_lapsed_paid_user_can_still_create_up_to_the_free_limit(api, db):
    _, user = _admin_in(db, plan="studio", access_expires_at=_past(days=2))
    headers = auth(user)
    for i in range(FREE.max_clients):
        r = api.post(
            "/api/v1/clients", headers=headers, json={"name": f"n{i}"}
        )
        assert r.status_code == 201
    over = api.post("/api/v1/clients", headers=headers, json={"name": "x"})
    assert over.status_code == 403


def test_free_business_with_past_expiry_has_no_countdown_in_me(api, db):
    _, user = _admin_in(db, plan="free", access_expires_at=_past(days=5))
    access = api.get("/api/v1/auth/me", headers=auth(user)).json()["access"]
    assert access["expired"] is False
    assert access["days_left"] is None


def test_viewer_of_a_lapsed_business_can_read_but_not_write(api, db):
    biz = make_business(db, plan="solo", access_expires_at=_past(days=1))
    viewer = make_user(db, role=UserRole.viewer, business=biz)
    as_business(db, biz.id)
    headers = auth(viewer)
    assert api.get("/api/v1/clients", headers=headers).status_code == 200
    post = api.post("/api/v1/clients", headers=headers, json={"name": "n"})
    assert post.status_code == 403


def test_deactivated_business_is_still_refused_after_the_change(api, db):
    biz = make_business(db, plan="free", is_active=False)
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    assert api.get("/api/v1/clients", headers=auth(user)).status_code == 403


# --- locked clients: the rule ------------------------------------------------


def test_no_client_is_locked_when_the_plan_is_unlimited(db):
    biz = make_business(db, plan="studio")
    as_business(db, biz.id)
    _clients(db, 8)
    assert locked_client_ids(biz, db) == set()


def test_no_client_is_locked_at_exactly_the_limit(db):
    biz = make_business(db, plan="free")
    as_business(db, biz.id)
    _clients(db, FREE.max_clients)
    assert locked_client_ids(biz, db) == set()


def test_only_the_newest_clients_over_the_limit_are_locked(db):
    biz = make_business(db, plan="free")
    as_business(db, biz.id)
    clients = _clients(db, FREE.max_clients + 2)
    assert locked_client_ids(biz, db) == {c.id for c in clients[-2:]}


def test_a_zero_limit_locks_every_active_client(db):
    biz = make_business(db, plan="free", max_clients=0)
    as_business(db, biz.id)
    clients = _clients(db, 2)
    assert locked_client_ids(biz, db) == {c.id for c in clients}


def test_inactive_clients_are_never_locked_and_do_not_take_a_slot(db):
    biz = make_business(db, plan="free", max_clients=2)
    as_business(db, biz.id)
    old = make_client_row(db, "old", created_at=BASE, is_active=False)
    a, b, c = (
        make_client_row(db, n, created_at=BASE + timedelta(days=i + 1))
        for i, n in enumerate("abc")
    )
    locked = locked_client_ids(biz, db)
    assert locked == {c.id}
    assert old.id not in locked and a.id not in locked and b.id not in locked


def test_clients_created_at_the_same_instant_lock_deterministically(db):
    biz = make_business(db, plan="free", max_clients=1)
    as_business(db, biz.id)
    rows = [make_client_row(db, f"t{i}", created_at=BASE) for i in range(3)]
    expected_open = min(rows, key=lambda c: c.id)
    first = locked_client_ids(biz, db)
    assert first == {c.id for c in rows if c.id != expected_open.id}
    assert locked_client_ids(biz, db) == first  # stable across calls


def test_upgrading_the_plan_unlocks_clients_without_touching_data(db):
    biz = make_business(db, plan="free")
    as_business(db, biz.id)
    clients = _clients(db, FREE.max_clients + 2)
    assert len(locked_client_ids(biz, db)) == 2
    biz.plan = "studio"
    assert locked_client_ids(biz, db) == set()
    assert all(c.is_active for c in clients)


def test_raising_a_single_business_override_unlocks_some(db):
    biz = make_business(db, plan="free", max_clients=1)
    as_business(db, biz.id)
    clients = _clients(db, 3)
    assert locked_client_ids(biz, db) == {clients[1].id, clients[2].id}
    biz.max_clients = 2
    assert locked_client_ids(biz, db) == {clients[2].id}


def test_a_lapse_locks_clients_that_a_paid_plan_had_allowed(db):
    biz = make_business(db, plan="solo", access_expires_at=_future(days=2))
    as_business(db, biz.id)
    clients = _clients(db, FREE.max_clients + 3)
    assert locked_client_ids(biz, db) == set()
    biz.access_expires_at = _past(seconds=5)
    assert locked_client_ids(biz, db) == {c.id for c in clients[-3:]}


def test_locking_never_crosses_business_boundaries(db):
    other = make_business(db, plan="free")
    as_business(db, other.id)
    _clients(db, 6)
    as_owner(db)
    mine = make_business(db, plan="free")
    as_business(db, mine.id)
    clients = _clients(db, 2)
    assert locked_client_ids(mine, db) == set()
    assert {c.business_id for c in clients} == {mine.id}


# --- locked clients: the API -------------------------------------------------


def _locked_setup(api, db, extra: int = 1, **biz_kw):
    biz_kw.setdefault("plan", "free")
    biz, user = _admin_in(db, **biz_kw)
    limit = effective_limits(db, biz).max_clients
    clients = _clients(db, (limit or 0) + extra)
    return biz, user, clients, auth(user)


def test_list_flags_locked_clients_and_leaves_open_ones_unflagged(api, db):
    _, _, clients, headers = _locked_setup(api, db, extra=2)
    rows = api.get("/api/v1/clients", headers=headers).json()
    flags = {r["name"]: r["locked"] for r in rows}
    assert flags == {
        "c0": False,
        "c1": False,
        "c2": False,
        "c3": True,
        "c4": True,
    }


def test_detail_of_a_locked_client_still_loads_with_the_flag(api, db):
    _, _, clients, headers = _locked_setup(api, db)
    locked = clients[-1]
    r = api.get(f"/api/v1/clients/{locked.id}", headers=headers)
    assert r.status_code == 200 and r.json()["locked"] is True
    ok = api.get(f"/api/v1/clients/{clients[0].id}", headers=headers)
    assert ok.json()["locked"] is False


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("get", "/clients/{id}/designs", None),
        ("get", "/clients/{id}/designs/count", None),
        ("put", "/clients/{id}", {"name": "renamed"}),
        ("get", "/clients/{id}/access", None),
        ("put", "/clients/{id}/phase", {"phase": "design"}),
    ],
)
def test_workspace_routes_of_a_locked_client_are_refused_with_upgrade_hint(
    api, db, method, path, body
):
    _, _, clients, headers = _locked_setup(api, db)
    url = "/api/v1" + path.format(id=clients[-1].id)
    r = getattr(api, method)(
        url, headers=headers, **({"json": body} if body else {})
    )
    assert r.status_code == 403
    assert "locked" in r.json()["detail"].lower()
    assert "upgrade" in r.json()["detail"].lower()


def test_the_same_routes_work_for_an_open_client(api, db):
    _, _, clients, headers = _locked_setup(api, db)
    open_id = clients[0].id
    assert (
        api.get(
            f"/api/v1/clients/{open_id}/designs", headers=headers
        ).status_code
        == 200
    )
    assert (
        api.get(
            f"/api/v1/clients/{open_id}/designs/count", headers=headers
        ).status_code
        == 200
    )


def test_a_locked_client_can_be_archived_which_frees_a_slot(api, db):
    _, _, clients, headers = _locked_setup(api, db)
    locked = clients[-1]
    r = api.patch(f"/api/v1/clients/{locked.id}/deactivate", headers=headers)
    assert r.status_code == 200 and r.json()["is_active"] is False


def test_archiving_an_open_client_unlocks_the_next_one(api, db):
    _, _, clients, headers = _locked_setup(api, db)
    api.patch(f"/api/v1/clients/{clients[0].id}/deactivate", headers=headers)
    r = api.get(f"/api/v1/clients/{clients[-1].id}", headers=headers)
    assert r.json()["locked"] is False


def test_reactivating_the_oldest_client_pushes_the_newest_back_to_locked(
    api, db
):
    _, _, clients, headers = _locked_setup(api, db)
    api.patch(f"/api/v1/clients/{clients[0].id}/deactivate", headers=headers)
    assert (
        api.get(f"/api/v1/clients/{clients[-1].id}", headers=headers).json()[
            "locked"
        ]
        is False
    )
    api.patch(f"/api/v1/clients/{clients[0].id}/activate", headers=headers)
    assert (
        api.get(f"/api/v1/clients/{clients[-1].id}", headers=headers).json()[
            "locked"
        ]
        is True
    )


def test_inactive_list_never_marks_archived_clients_locked(api, db):
    _, _, clients, headers = _locked_setup(api, db)
    api.patch(f"/api/v1/clients/{clients[0].id}/deactivate", headers=headers)
    rows = api.get(
        "/api/v1/clients", headers=headers, params={"show_inactive": True}
    ).json()
    assert [r["name"] for r in rows] == ["c0"]
    assert rows[0]["locked"] is False


def test_creating_a_client_stays_blocked_while_over_the_limit(api, db):
    _, _, _, headers = _locked_setup(api, db, extra=2)
    r = api.post("/api/v1/clients", headers=headers, json={"name": "new"})
    assert r.status_code == 403
    assert "upgrade" in r.json()["detail"].lower()


def test_upgrading_unlocks_through_the_api_immediately(api, db):
    biz, _, clients, headers = _locked_setup(api, db, extra=2)
    assert any(
        c["locked"] for c in api.get("/api/v1/clients", headers=headers).json()
    )
    biz.plan = "studio"
    db.flush()
    rows = api.get("/api/v1/clients", headers=headers).json()
    assert not any(c["locked"] for c in rows)
    ok = api.get(f"/api/v1/clients/{clients[-1].id}/designs", headers=headers)
    assert ok.status_code == 200


def test_unlimited_plan_never_flags_anything(api, db):
    _, _, _, headers = _locked_setup(api, db, plan="studio", extra=6)
    rows = api.get("/api/v1/clients", headers=headers).json()
    assert len(rows) == 6 and not any(r["locked"] for r in rows)


def test_a_lapse_locks_through_the_api_and_a_renewal_unlocks(api, db):
    biz, user = _admin_in(db, plan="solo", access_expires_at=_future(days=1))
    headers = auth(user)
    _clients(db, FREE.max_clients + 2)

    def locked_count() -> int:
        rows = api.get("/api/v1/clients", headers=headers).json()
        return sum(r["locked"] for r in rows)

    assert locked_count() == 0
    biz.access_expires_at = _past(seconds=5)
    db.flush()
    assert locked_count() == 2
    biz.access_expires_at = _future(days=30)
    db.flush()
    assert locked_count() == 0


def test_designer_sees_the_lock_flag_for_their_own_assigned_clients(api, db):
    biz = make_business(db, plan="free")
    admin = make_user(db, role=UserRole.admin, business=biz)
    designer = make_user(db, role=UserRole.designer, business=biz)
    as_business(db, biz.id)
    clients = [
        make_client_row(
            db,
            f"c{i}",
            created_at=BASE + timedelta(minutes=i),
            assigned_designer_id=designer.id if i in (0, 3) else None,
        )
        for i in range(4)
    ]
    rows = api.get("/api/v1/clients", headers=auth(designer)).json()
    assert {r["name"]: r["locked"] for r in rows} == {"c0": False, "c3": True}
    blocked = api.get(
        f"/api/v1/clients/{clients[3].id}/designs", headers=auth(designer)
    )
    assert blocked.status_code == 403
    assert admin  # silence unused


def test_out_of_scope_client_is_still_404_not_403(api, db):
    biz = make_business(db, plan="free")
    designer = make_user(db, role=UserRole.designer, business=biz)
    as_business(db, biz.id)
    clients = _clients(db, FREE.max_clients + 1)
    r = api.get(
        f"/api/v1/clients/{clients[-1].id}/designs", headers=auth(designer)
    )
    assert r.status_code == 404


def test_viewer_gets_locked_flags_but_cannot_write(api, db):
    biz = make_business(db, plan="free")
    viewer = make_user(db, role=UserRole.viewer, business=biz)
    as_business(db, biz.id)
    clients = _clients(db, FREE.max_clients + 1)
    rows = api.get("/api/v1/clients", headers=auth(viewer)).json()
    assert [r["locked"] for r in rows].count(True) == 1
    deact = api.patch(
        f"/api/v1/clients/{clients[0].id}/deactivate", headers=auth(viewer)
    )
    assert deact.status_code == 403


def test_unknown_or_malformed_client_ids_are_unchanged_by_locking(api, db):
    _, _, _, headers = _locked_setup(api, db)
    assert (
        api.get(f"/api/v1/clients/{uuid.uuid4()}", headers=headers).status_code
        == 404
    )
    assert (
        api.get("/api/v1/clients/not-a-uuid", headers=headers).status_code
        == 400
    )


def test_superadmin_listing_clients_is_not_affected(api, db):
    admin = make_user(db, role=UserRole.superadmin)
    as_owner(db)
    r = api.get("/api/v1/clients", headers=auth(admin))
    assert r.status_code == 200 and r.json() == []


# --- locked portfolio designs: the rule --------------------------------------


def _portfolio(db, biz, client, count: int, start: int = 0):
    return [_design(db, biz, client, start + i) for i in range(count)]


def test_nothing_is_locked_when_portfolio_is_unlimited(db):
    biz = make_business(db, plan="studio")
    as_business(db, biz.id)
    client = make_client_row(db, "c")
    _portfolio(db, biz, client, 14)
    assert locked_portfolio_ids(biz, db) == set()


def test_nothing_is_locked_at_exactly_the_portfolio_limit(db):
    biz = make_business(db, plan="free")
    as_business(db, biz.id)
    client = make_client_row(db, "c")
    _portfolio(db, biz, client, FREE.max_portfolio_designs)
    assert locked_portfolio_ids(biz, db) == set()


def test_designs_after_the_limit_in_portfolio_order_are_locked(db):
    biz = make_business(db, plan="free", max_portfolio_designs=3)
    as_business(db, biz.id)
    client = make_client_row(db, "c")
    designs = _portfolio(db, biz, client, 5)
    assert locked_portfolio_ids(biz, db) == {d.id for d in designs[3:]}


def test_lock_follows_portfolio_position_not_creation_order(db):
    biz = make_business(db, plan="free", max_portfolio_designs=1)
    as_business(db, biz.id)
    client = make_client_row(db, "c")
    created_first = _design(db, biz, client, 5)
    created_second = _design(db, biz, client, 0)  # shown first
    assert locked_portfolio_ids(biz, db) == {created_first.id}
    assert created_second.id not in locked_portfolio_ids(biz, db)


def test_reordering_changes_which_design_is_locked(db):
    biz = make_business(db, plan="free", max_portfolio_designs=1)
    as_business(db, biz.id)
    client = make_client_row(db, "c")
    a = _design(db, biz, client, 0)
    b = _design(db, biz, client, 1)
    assert locked_portfolio_ids(biz, db) == {b.id}
    a.portfolio_position, b.portfolio_position = 1, 0
    db.flush()
    assert locked_portfolio_ids(biz, db) == {a.id}


def test_designs_outside_the_portfolio_never_count_or_lock(db):
    biz = make_business(db, plan="free", max_portfolio_designs=1)
    as_business(db, biz.id)
    client = make_client_row(db, "c")
    kept = _design(db, biz, client, 0)
    out = _design(db, biz, client, 1, in_portfolio=False)
    assert locked_portfolio_ids(biz, db) == set()
    assert kept.id not in locked_portfolio_ids(biz, db)
    assert out.id not in locked_portfolio_ids(biz, db)


def test_designs_of_archived_clients_do_not_take_a_slot(db):
    biz = make_business(db, plan="free", max_portfolio_designs=1)
    as_business(db, biz.id)
    archived = make_client_row(db, "gone", is_active=False)
    live = make_client_row(db, "live")
    _design(db, biz, archived, 0)
    mine = _design(db, biz, live, 1)
    assert locked_portfolio_ids(biz, db) == set()
    assert mine.id not in locked_portfolio_ids(biz, db)


def test_zero_portfolio_limit_locks_everything(db):
    biz = make_business(db, plan="free", max_portfolio_designs=0)
    as_business(db, biz.id)
    client = make_client_row(db, "c")
    designs = _portfolio(db, biz, client, 2)
    assert locked_portfolio_ids(biz, db) == {d.id for d in designs}


def test_a_lapse_locks_extra_portfolio_designs_and_a_renewal_unlocks(db):
    biz = make_business(db, plan="solo", access_expires_at=_future(days=1))
    as_business(db, biz.id)
    client = make_client_row(db, "c")
    _portfolio(db, biz, client, FREE.max_portfolio_designs + 3)
    assert locked_portfolio_ids(biz, db) == set()
    biz.access_expires_at = _past(seconds=1)
    assert len(locked_portfolio_ids(biz, db)) == 3
    biz.access_expires_at = _future(days=30)
    assert locked_portfolio_ids(biz, db) == set()


def test_upgrading_unlocks_portfolio_designs(db):
    biz = make_business(db, plan="free")
    as_business(db, biz.id)
    client = make_client_row(db, "c")
    _portfolio(db, biz, client, FREE.max_portfolio_designs + 2)
    assert len(locked_portfolio_ids(biz, db)) == 2
    biz.plan = "studio"
    assert locked_portfolio_ids(biz, db) == set()


# --- locked portfolio designs: the API ---------------------------------------


def _portfolio_setup(db, limit: int = 2, total: int = 4):
    biz, user = _admin_in(db, plan="free", max_portfolio_designs=limit)
    client = make_client_row(db, "c")
    designs = _portfolio(db, biz, client, total)
    return biz, user, client, designs, auth(user)


def test_portfolio_list_flags_only_designs_over_the_limit(api, db):
    _, _, _, designs, headers = _portfolio_setup(db)
    rows = api.get("/api/v1/portfolio-designs", headers=headers).json()
    assert [(r["title"], r["locked"]) for r in rows] == [
        ("d0", False),
        ("d1", False),
        ("d2", True),
        ("d3", True),
    ]
    assert designs  # created above


def test_portfolio_list_flags_nothing_on_an_unlimited_plan(api, db):
    biz, user = _admin_in(db, plan="studio")
    client = make_client_row(db, "c")
    _portfolio(db, biz, client, 5)
    rows = api.get("/api/v1/portfolio-designs", headers=auth(user)).json()
    assert len(rows) == 5 and not any(r["locked"] for r in rows)


def test_removing_a_design_from_the_portfolio_unlocks_the_next_one(api, db):
    _, _, client, designs, headers = _portfolio_setup(db)
    designs[0].in_portfolio = False
    db.flush()
    rows = api.get("/api/v1/portfolio-designs", headers=headers).json()
    assert [(r["title"], r["locked"]) for r in rows] == [
        ("d1", False),
        ("d2", False),
        ("d3", True),
    ]


def test_sharing_only_open_designs_is_allowed(api, db):
    _, _, _, designs, headers = _portfolio_setup(db)
    r = api.post(
        "/api/v1/portfolio-shares",
        headers=headers,
        json={"design_ids": [str(designs[0].id), str(designs[1].id)]},
    )
    assert r.status_code == 201


def test_sharing_a_locked_design_is_refused_with_an_upgrade_hint(api, db):
    _, _, _, designs, headers = _portfolio_setup(db)
    r = api.post(
        "/api/v1/portfolio-shares",
        headers=headers,
        json={"design_ids": [str(designs[2].id)]},
    )
    assert r.status_code == 403
    assert r.json()["detail"] == PORTFOLIO_LOCKED_DETAIL


def test_sharing_a_mix_of_open_and_locked_is_refused_entirely(api, db):
    _, _, _, designs, headers = _portfolio_setup(db)
    r = api.post(
        "/api/v1/portfolio-shares",
        headers=headers,
        json={"design_ids": [str(designs[0].id), str(designs[3].id)]},
    )
    assert r.status_code == 403
    listed = api.get("/api/v1/portfolio-shares", headers=headers).json()
    assert listed == []


def test_unknown_design_id_returns_404_before_the_lock_check(api, db):
    _, _, _, _, headers = _portfolio_setup(db)
    r = api.post(
        "/api/v1/portfolio-shares",
        headers=headers,
        json={"design_ids": [str(uuid.uuid4())]},
    )
    assert r.status_code == 404


def test_share_works_again_after_upgrading(api, db):
    biz, _, _, designs, headers = _portfolio_setup(db)
    biz.plan = "studio"
    biz.max_portfolio_designs = None
    db.flush()
    r = api.post(
        "/api/v1/portfolio-shares",
        headers=headers,
        json={"design_ids": [str(designs[3].id)]},
    )
    assert r.status_code == 201


def _public_share(db, biz, design_ids):
    share = PortfolioShare(
        business_id=biz.id,
        token=uuid.uuid4().hex,
        design_ids=[str(i) for i in design_ids],
        expires_at=None,
        created_at=datetime.now(UTC),
    )
    db.add(share)
    db.flush()
    return share.token


def test_public_share_hides_locked_designs_even_if_linked_earlier(api, db):
    biz, _, _, designs, _ = _portfolio_setup(db)
    token = _public_share(db, biz, [d.id for d in designs])
    as_owner(db)
    body = api.get(f"/api/v1/portfolio/{token}").json()
    assert sorted(d["title"] for d in body["designs"]) == ["d0", "d1"]


def test_public_share_of_only_locked_designs_is_empty_not_an_error(api, db):
    biz, _, _, designs, _ = _portfolio_setup(db)
    token = _public_share(db, biz, [designs[2].id, designs[3].id])
    as_owner(db)
    r = api.get(f"/api/v1/portfolio/{token}")
    assert r.status_code == 200 and r.json()["designs"] == []


def test_public_share_shows_everything_again_after_upgrade(api, db):
    biz, _, _, designs, _ = _portfolio_setup(db)
    token = _public_share(db, biz, [d.id for d in designs])
    biz.plan = "studio"
    biz.max_portfolio_designs = None
    db.flush()
    as_owner(db)
    body = api.get(f"/api/v1/portfolio/{token}").json()
    assert len(body["designs"]) == 4


def test_public_share_keeps_existing_404_rules(api, db):
    biz, _, _, designs, _ = _portfolio_setup(db)
    token = _public_share(db, biz, [designs[0].id])
    as_owner(db)
    share = db.query(PortfolioShare).filter_by(token=token).one()
    share.revoked_at = datetime.now(UTC)
    db.flush()
    assert api.get(f"/api/v1/portfolio/{token}").status_code == 404


def test_public_gallery_serves_only_designs_within_the_limit(api, db):
    biz = make_business(
        db,
        plan="free",
        slug=f"s-{uuid.uuid4().hex[:8]}",
        max_portfolio_designs=2,
    )
    client = make_client_row(db, "c", business_id=biz.id)
    for i in range(4):
        _design(db, biz, client, i, image_url=f"https://e.com/{i}.png")
    body = api.get(f"/api/v1/site/{biz.slug}").json()
    assert body["mode"] == "gallery"
    assert [d["title"] for d in body["designs"]] == ["d0", "d1"]


def test_public_gallery_after_a_lapse_shows_only_the_free_allowance(api, db):
    biz = make_business(
        db,
        plan="studio",
        slug=f"s-{uuid.uuid4().hex[:8]}",
        site_published=True,
        access_expires_at=_past(days=1),
    )
    client = make_client_row(db, "c", business_id=biz.id)
    for i in range(FREE.max_portfolio_designs + 3):
        _design(db, biz, client, i, image_url=f"https://e.com/{i}.png")
    body = api.get(f"/api/v1/site/{biz.slug}").json()
    assert body["mode"] == "gallery"
    assert len(body["designs"]) == FREE.max_portfolio_designs


def test_public_gallery_on_a_live_paid_plan_is_unaffected(api, db):
    biz = make_business(
        db,
        plan="studio",
        slug=f"s-{uuid.uuid4().hex[:8]}",
        site_published=True,
        access_expires_at=_future(days=10),
    )
    client = make_client_row(db, "c", business_id=biz.id)
    for i in range(FREE.max_portfolio_designs + 3):
        _design(db, biz, client, i, image_url=f"https://e.com/{i}.png")
    body = api.get(f"/api/v1/site/{biz.slug}").json()
    assert body["mode"] == "site"


# --- admin list reflects the fallback ----------------------------------------


def test_admin_list_shows_free_for_a_lapsed_business(api, db):
    seed_plans(db)
    admin = make_user(db, role=UserRole.superadmin)
    lapsed = make_business(
        db, name="Lapsed Co", plan="solo", access_expires_at=_past(days=1)
    )
    free_old = make_business(
        db, name="Free Co", plan="free", access_expires_at=_past(days=40)
    )
    rows = {
        b["name"]: b
        for b in api.get("/api/v1/businesses", headers=auth(admin)).json()
    }
    assert rows["Lapsed Co"]["plan_name"] == "Free"
    assert rows["Lapsed Co"]["access_expired"] is True
    assert rows["Lapsed Co"]["limits"]["plan"] == "free"
    assert rows["Free Co"]["access_expired"] is False
    assert rows["Free Co"]["days_left"] is None
    assert lapsed.id and free_old.id
