"""Plan-limit error wording and per-business usage on the admin list."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from backend.models.design import Design, DesignSource
from backend.models.quotation import Quotation
from backend.models.quotation_version import QuotationVersion
from backend.models.user import UserRole
from backend.services.plan_catalog import DEFAULTS_BY_SLUG
from backend.services.plan_limits import (
    effective_limits,
    ensure_can_add_client,
    ensure_can_add_to_portfolio,
    ensure_can_add_version,
    usage_summary,
)

from .conftest import (
    as_business,
    as_owner,
    auth,
    make_business,
    make_client_row,
    make_user,
)

BUSINESSES = "/api/v1/businesses"
CLIENTS = "/api/v1/clients"


def _message(limit: int, what: str) -> str:
    return (
        f"Plan limit reached: your current plan allows only {limit} {what}. "
        "To add more, please upgrade your plan (Billing page)."
    )


def _designs(db, business, n: int, **kw) -> None:
    for _ in range(n):
        db.add(
            Design(
                id=uuid.uuid4(),
                business_id=business.id,
                source=DesignSource.designer_uploaded,
                **kw,
            )
        )
    db.flush()


def _quotation_with_versions(db, business, n: int) -> Quotation:
    client = make_client_row(db, business_id=business.id)
    quotation = Quotation(id=uuid.uuid4(), client_id=client.id)
    db.add(quotation)
    db.flush()
    for i in range(n):
        db.add(
            QuotationVersion(
                id=uuid.uuid4(),
                quotation_id=quotation.id,
                number=i + 1,
                line_items=[],
                initial_total=0,
                negotiated_total=0,
                room_designs={},
            )
        )
    db.flush()
    return quotation


def _blocked(call) -> HTTPException:
    with pytest.raises(HTTPException) as err:
        call()
    assert err.value.status_code == 403
    return err.value


# --- message wording ---------------------------------------------------------


def test_client_limit_message_is_exact_and_names_the_billing_page(db):
    biz = make_business(db, plan="free", max_clients=2)
    as_business(db, biz.id)
    make_client_row(db, "a")
    make_client_row(db, "b")
    err = _blocked(lambda: ensure_can_add_client(biz, db))
    assert err.detail == _message(2, "active clients")
    assert "Billing page" in err.detail


def test_version_limit_message_is_exact(db):
    biz = make_business(db, plan="free", max_quotation_versions=2)
    quotation = _quotation_with_versions(db, biz, 2)
    err = _blocked(lambda: ensure_can_add_version(biz, quotation.id, db))
    assert err.detail == _message(2, "versions per quotation")


def test_portfolio_limit_message_is_exact(db):
    biz = make_business(db, plan="free", max_portfolio_designs=3)
    _designs(db, biz, 3, in_portfolio=True)
    err = _blocked(lambda: ensure_can_add_to_portfolio(biz, db))
    assert err.detail == _message(3, "portfolio designs")


# --- boundaries --------------------------------------------------------------


@pytest.mark.parametrize(
    ("existing", "blocked"), [(0, False), (1, False), (2, True), (3, True)]
)
def test_client_boundary(db, existing, blocked):
    biz = make_business(db, plan="free", max_clients=2)
    as_business(db, biz.id)
    for i in range(existing):
        make_client_row(db, f"c{i}")
    if blocked:
        _blocked(lambda: ensure_can_add_client(biz, db))
    else:
        ensure_can_add_client(biz, db)


@pytest.mark.parametrize(
    ("existing", "blocked"), [(0, False), (1, False), (2, True), (3, True)]
)
def test_version_boundary(db, existing, blocked):
    biz = make_business(db, plan="free", max_quotation_versions=2)
    quotation = _quotation_with_versions(db, biz, existing)
    if blocked:
        _blocked(lambda: ensure_can_add_version(biz, quotation.id, db))
    else:
        ensure_can_add_version(biz, quotation.id, db)


@pytest.mark.parametrize(
    ("existing", "blocked"), [(0, False), (2, False), (3, True), (4, True)]
)
def test_portfolio_boundary(db, existing, blocked):
    biz = make_business(db, plan="free", max_portfolio_designs=3)
    _designs(db, biz, existing, in_portfolio=True)
    if blocked:
        _blocked(lambda: ensure_can_add_to_portfolio(biz, db))
    else:
        ensure_can_add_to_portfolio(biz, db)


def test_zero_limit_blocks_the_first_item(db):
    biz = make_business(db, plan="free", max_clients=0)
    err = _blocked(lambda: ensure_can_add_client(biz, db))
    assert err.detail == _message(0, "active clients")


def test_no_business_is_never_blocked(db):
    ensure_can_add_client(None, db)
    ensure_can_add_to_portfolio(None, db)
    ensure_can_add_version(None, uuid.uuid4(), db)


def test_non_portfolio_designs_and_archived_clients_do_not_count(db):
    biz = make_business(
        db, plan="free", max_portfolio_designs=1, max_clients=1
    )
    as_business(db, biz.id)
    make_client_row(db, "old", is_active=False)
    _designs(db, biz, 5, in_portfolio=False)
    ensure_can_add_to_portfolio(biz, db)
    ensure_can_add_client(biz, db)


# --- plans: Free vs paid, aliases, lapsed ------------------------------------


def test_free_plan_default_limits_block_at_their_caps(db):
    biz = make_business(db, plan="free")
    as_business(db, biz.id)
    cap = DEFAULTS_BY_SLUG["free"].max_clients
    for i in range(cap):
        make_client_row(db, f"c{i}")
    err = _blocked(lambda: ensure_can_add_client(biz, db))
    assert err.detail == _message(cap, "active clients")


def test_unlimited_plan_never_blocks(db):
    biz = make_business(db, plan="studio")
    as_business(db, biz.id)
    for i in range(DEFAULTS_BY_SLUG["free"].max_clients + 2):
        make_client_row(db, f"c{i}")
    ensure_can_add_client(biz, db)
    ensure_can_add_to_portfolio(biz, db)


def test_retired_pro_slug_gets_studio_limits(db):
    biz = make_business(db, plan="pro")
    limits = effective_limits(db, biz)
    assert limits.plan == "studio"
    assert limits.max_clients is None


def test_override_beats_plan_in_the_message(db):
    biz = make_business(db, plan="solo", max_clients=1)
    as_business(db, biz.id)
    make_client_row(db, "a")
    err = _blocked(lambda: ensure_can_add_client(biz, db))
    assert err.detail == _message(1, "active clients")


def test_lapsed_access_keeps_plan_limits(db):
    # Expiry is enforced by the access gate, not by limit maths.
    biz = make_business(
        db,
        plan="free",
        max_clients=1,
        access_expires_at=datetime.now(UTC) - timedelta(days=3),
    )
    as_business(db, biz.id)
    make_client_row(db, "a")
    err = _blocked(lambda: ensure_can_add_client(biz, db))
    assert err.detail == _message(1, "active clients")


# --- through the API ---------------------------------------------------------


def test_create_client_api_returns_the_new_message(api, db):
    biz = make_business(db, plan="free", max_clients=1)
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    ok = api.post(CLIENTS, headers=auth(user), json={"name": "A"})
    assert ok.status_code == 201
    blocked = api.post(CLIENTS, headers=auth(user), json={"name": "B"})
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == _message(1, "active clients")


# --- admin list usage --------------------------------------------------------


def _row(body: list[dict], biz) -> dict:
    return next(b for b in body if b["id"] == str(biz.id))


def _meters(row: dict) -> dict[str, dict]:
    return {m["key"]: m for m in row["usage"]}


def test_admin_list_requires_superadmin(api, db):
    biz = make_business(db)
    admin = make_user(db, role=UserRole.admin, business=biz)
    designer = make_user(db, role=UserRole.designer, business=biz)
    as_owner(db)
    assert api.get(BUSINESSES).status_code in (401, 403)
    assert api.get(BUSINESSES, headers=auth(admin)).status_code == 403
    assert api.get(BUSINESSES, headers=auth(designer)).status_code == 403


def test_admin_list_reports_usage_per_business(api, db):
    root = make_user(db, role=UserRole.superadmin)
    a = make_business(db, "Alpha", plan="free", max_clients=5)
    b = make_business(db, "Beta", plan="solo")
    make_user(db, role=UserRole.admin, business=a)
    make_user(db, role=UserRole.designer, business=a)
    make_user(db, role=UserRole.designer, business=a, is_active=False)
    make_user(db, role=UserRole.admin, business=b)
    for _ in range(2):
        make_client_row(db, business_id=a.id)
    make_client_row(db, business_id=a.id, is_active=False)
    make_client_row(db, business_id=b.id)
    _designs(db, a, 3, in_portfolio=True)
    _designs(db, a, 2, in_portfolio=False)
    _designs(db, b, 1, in_portfolio=True)

    body = api.get(BUSINESSES, headers=auth(root)).json()
    ma, mb = _meters(_row(body, a)), _meters(_row(body, b))

    assert {k: ma[k]["used"] for k in ma} == {
        "clients": 2,
        "users": 2,
        "images": 0,
        "portfolio": 3,
    }
    assert ma["clients"]["limit"] == 5
    assert (
        ma["portfolio"]["limit"]
        == DEFAULTS_BY_SLUG["free"].max_portfolio_designs
    )
    assert {k: mb[k]["used"] for k in mb} == {
        "clients": 1,
        "users": 1,
        "images": 0,
        "portfolio": 1,
    }
    assert mb["clients"]["limit"] == DEFAULTS_BY_SLUG["solo"].max_clients


def test_admin_list_counts_uploaded_images_per_business(api, db):
    root = make_user(db, role=UserRole.superadmin)
    a = make_business(db, "ImgA")
    b = make_business(db, "ImgB")
    _designs(db, a, 2, storage_path="x/y.png")
    _designs(db, b, 1, storage_path="x/z.png")
    body = api.get(BUSINESSES, headers=auth(root)).json()
    assert _meters(_row(body, a))["images"]["used"] == 2
    assert _meters(_row(body, b))["images"]["used"] == 1


def test_admin_list_usage_for_an_empty_business(api, db):
    root = make_user(db, role=UserRole.superadmin)
    biz = make_business(db, "Empty", plan="free")
    row = _row(api.get(BUSINESSES, headers=auth(root)).json(), biz)
    assert [m["key"] for m in row["usage"]] == [
        "clients",
        "users",
        "images",
        "portfolio",
    ]
    assert all(m["used"] == 0 for m in row["usage"])
    assert row["plan_name"] == "Free"


def test_admin_list_usage_shows_unlimited_as_null(api, db):
    root = make_user(db, role=UserRole.superadmin)
    biz = make_business(db, "Big", plan="studio")
    body = api.get(BUSINESSES, headers=auth(root)).json()
    assert _meters(_row(body, biz))["clients"]["limit"] is None


def test_admin_list_usage_matches_usage_summary(api, db):
    root = make_user(db, role=UserRole.superadmin)
    biz = make_business(db, "Same", plan="free")
    make_client_row(db, business_id=biz.id)
    row = _row(api.get(BUSINESSES, headers=auth(root)).json(), biz)
    as_owner(db)
    assert row["usage"] == [m.model_dump() for m in usage_summary(db, biz)]


def test_admin_list_usage_does_not_leak_across_businesses(api, db):
    root = make_user(db, role=UserRole.superadmin)
    a = make_business(db, "A1")
    b = make_business(db, "B1")
    make_client_row(db, business_id=a.id)
    body = api.get(BUSINESSES, headers=auth(root)).json()
    assert _meters(_row(body, b))["clients"]["used"] == 0
