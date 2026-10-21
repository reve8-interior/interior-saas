import uuid
from datetime import datetime, timedelta, timezone

import pytest

from backend.models.agent_audit_log import AgentAuditLog
from backend.models.checkpoint import Checkpoint
from backend.models.quotation import Quotation
from backend.models.user import UserRole
from backend.services.admin_monitor_service import (
    UNASSIGNED,
    get_business_ai_usage,
    get_business_clients,
    get_overview,
)

from .conftest import auth, make_business, make_client_row, make_user


def add_log(
    db,
    business,
    *,
    op="checkpoint_extract",
    model="gpt-4.1-mini",
    tokens=(1000, 500),
    cost="0.001",
    status="success",
    client=None,
    when=None,
    latency=1000,
):
    db.add(
        AgentAuditLog(
            id=uuid.uuid4(),
            business_id=business.id if business else None,
            client_id=client.id if client else None,
            operation=op,
            model=model,
            input_tokens=tokens[0],
            output_tokens=tokens[1],
            latency_ms=latency,
            cost_usd=cost,
            status=status,
            timestamp=when or datetime.now(timezone.utc),
        )
    )
    db.flush()


@pytest.fixture
def world(db):
    """Two businesses with differing data, plus one unassigned client."""
    a, b = make_business(db, "Alpha"), make_business(db, "Beta")
    designer = make_user(db, business=a, email="d@alpha.com")
    make_user(db, role=UserRole.admin, business=a)
    make_user(db, role=UserRole.admin, business=b)
    c1 = make_client_row(
        db,
        "A-One",
        business_id=a.id,
        assigned_designer_id=designer.id,
        contact_info={"phone": "999"},
    )
    c2 = make_client_row(db, "A-Two", business_id=a.id, is_active=False)
    c3 = make_client_row(db, "B-One", business_id=b.id)
    make_client_row(db, "Orphan")
    db.add_all(
        [
            Quotation(id=uuid.uuid4(), client_id=c1.id),
            Quotation(id=uuid.uuid4(), client_id=c3.id),
            Checkpoint(id=uuid.uuid4(), client_id=c1.id, summary_text="x"),
            Checkpoint(id=uuid.uuid4(), client_id=c1.id, summary_text="y"),
        ]
    )
    db.flush()
    add_log(db, a, client=c1, cost="0.0072", tokens=(10000, 2000))
    add_log(
        db,
        a,
        op="audio_transcribe",
        model="whisper-1",
        tokens=(None, None),
        cost="0.012",
    )
    add_log(db, a, status="error", tokens=(0, 0), cost="0", client=c1)
    add_log(db, b, cost="0.5", tokens=(100, 100))
    return a, b, c1, c2, c3


def by_name(overview):
    return {row.name: row for row in overview.businesses}


def test_overview_counts_per_business(db, world):
    rows = by_name(get_overview(db))
    alpha, beta = rows["Alpha"], rows["Beta"]
    assert (alpha.users, alpha.clients, alpha.active_clients) == (2, 2, 1)
    assert (alpha.quotations, alpha.checkpoints) == (1, 2)
    assert (beta.users, beta.clients, beta.quotations) == (1, 1, 1)
    assert beta.checkpoints == 0


def test_overview_ai_usage_and_cost(db, world):
    rows = by_name(get_overview(db))
    alpha, beta = rows["Alpha"], rows["Beta"]
    assert alpha.ai_calls == 3
    assert alpha.ai_tokens == 12_000
    assert alpha.ai_cost_usd == pytest.approx(0.0192)
    assert beta.ai_cost_usd == pytest.approx(0.5)


def test_overview_totals_and_unassigned_bucket(db, world):
    overview = get_overview(db)
    rows = by_name(overview)
    assert rows[UNASSIGNED].id is None
    assert rows[UNASSIGNED].clients == 1
    assert overview.totals.businesses == 2
    assert overview.totals.active_businesses == 2
    assert overview.totals.ai_calls == 4
    assert overview.totals.ai_cost_usd == pytest.approx(0.5192)
    assert overview.ai_calls_by_operation["checkpoint_extract"] == 3
    assert overview.ai_calls_by_operation["audio_transcribe"] == 1


def test_overview_inactive_business_flag(db, world):
    a, *_ = world
    a.is_active = False
    db.flush()
    overview = get_overview(db)
    assert overview.totals.active_businesses == 1
    assert by_name(overview)["Alpha"].is_active is False


def test_business_without_activity_has_zeroes(db):
    make_business(db, "Quiet")
    row = by_name(get_overview(db))["Quiet"]
    assert (row.clients, row.ai_calls, row.ai_cost_usd) == (0, 0, 0.0)
    assert row.last_activity is None


def test_business_clients_rows(db, world):
    a, b, c1, *_ = world
    rows = {r.name: r for r in get_business_clients(db, a.id)}
    assert set(rows) == {"A-One", "A-Two"}
    one = rows["A-One"]
    assert one.designer_email == "d@alpha.com"
    assert one.contact_info == {"phone": "999"}
    assert (one.quotations, one.checkpoints, one.ai_calls) == (1, 2, 2)
    assert rows["A-Two"].is_active is False
    assert [r.name for r in get_business_clients(db, b.id)] == ["B-One"]


def test_unassigned_clients(db, world):
    assert [r.name for r in get_business_clients(db, None)] == ["Orphan"]


def test_ai_usage_totals_and_cost(db, world):
    a, *_ = world
    usage = get_business_ai_usage(db, a.id, 30)
    assert usage.calls == 3
    assert usage.errors == 1
    assert usage.input_tokens == 10_000
    assert usage.output_tokens == 2_000
    assert usage.cost_usd == pytest.approx(0.0192)
    assert usage.avg_latency_ms == 1000


def test_ai_usage_by_operation(db, world):
    a, *_ = world
    ops = {
        o.operation: o
        for o in get_business_ai_usage(db, a.id, 30).by_operation
    }
    assert ops["checkpoint_extract"].calls == 2
    assert ops["checkpoint_extract"].errors == 1
    assert ops["checkpoint_extract"].cost_usd == pytest.approx(0.0072)
    assert ops["audio_transcribe"].cost_usd == pytest.approx(0.012)


def test_ai_usage_daily_series_is_continuous(db, world):
    a, *_ = world
    usage = get_business_ai_usage(db, a.id, 7)
    assert len(usage.daily) == 7
    today = datetime.now(timezone.utc).date()
    assert usage.daily[-1].day == today
    assert usage.daily[-1].calls == 3
    assert usage.daily[-1].cost_usd == pytest.approx(0.0192)
    assert all(d.calls == 0 for d in usage.daily[:-1])


def test_ai_usage_window_excludes_old_calls(db, world):
    a, *_ = world
    add_log(
        db, a, when=datetime.now(timezone.utc) - timedelta(days=20), cost="9"
    )
    assert get_business_ai_usage(db, a.id, 7).calls == 3
    wide = get_business_ai_usage(db, a.id, 30)
    assert wide.calls == 4
    assert wide.cost_usd == pytest.approx(9.0192)


def test_ai_usage_recent_has_cost_and_client(db, world):
    a, *_ = world
    recent = get_business_ai_usage(db, a.id, 30).recent
    assert len(recent) == 3
    assert {r.client_name for r in recent} == {"A-One", None}
    unpriced = [r for r in recent if r.operation == "audio_transcribe"][0]
    assert unpriced.cost_usd == pytest.approx(0.012)


def test_ai_usage_is_isolated_per_business(db, world):
    _, b, *_ = world
    usage = get_business_ai_usage(db, b.id, 30)
    assert usage.calls == 1
    assert usage.cost_usd == pytest.approx(0.5)


# ── HTTP layer ─────────────────────────────────────────────────────────────
def test_monitor_endpoints_require_superadmin(api, db, world):
    a, *_ = world
    admin = make_user(db, role=UserRole.admin, business=a)
    urls = [
        "/api/v1/admin/overview",
        f"/api/v1/admin/businesses/{a.id}/clients",
        f"/api/v1/admin/businesses/{a.id}/usage",
        "/api/v1/admin/unassigned/clients",
    ]
    for url in urls:
        assert api.get(url).status_code == 401
        assert api.get(url, headers=auth(admin)).status_code == 403


def test_monitor_endpoints_for_superadmin(api, db, world):
    a, *_ = world
    h = auth(make_user(db, role=UserRole.superadmin))
    overview = api.get("/api/v1/admin/overview", headers=h)
    assert overview.status_code == 200
    assert overview.json()["totals"]["ai_cost_usd"] == pytest.approx(0.5192)
    usage = api.get(f"/api/v1/admin/businesses/{a.id}/usage?days=7", headers=h)
    assert usage.status_code == 200
    assert usage.json()["cost_usd"] == pytest.approx(0.0192)
    clients = api.get(f"/api/v1/admin/businesses/{a.id}/clients", headers=h)
    assert len(clients.json()) == 2
    assert (
        len(api.get("/api/v1/admin/unassigned/clients", headers=h).json()) == 1
    )


def test_usage_days_bounds_and_unknown_business(api, db, world):
    a, *_ = world
    h = auth(make_user(db, role=UserRole.superadmin))
    for days in (0, 91):
        r = api.get(
            f"/api/v1/admin/businesses/{a.id}/usage?days={days}", headers=h
        )
        assert r.status_code == 422
    ghost = uuid.uuid4()
    assert (
        api.get(
            f"/api/v1/admin/businesses/{ghost}/usage", headers=h
        ).status_code
        == 404
    )
    assert (
        api.get(
            f"/api/v1/admin/businesses/{ghost}/clients", headers=h
        ).status_code
        == 404
    )
