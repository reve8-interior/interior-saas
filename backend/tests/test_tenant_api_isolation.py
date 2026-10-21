"""End-to-end through HTTP: one business can never reach another's data."""

import uuid

import pytest

from backend.models.agent_audit_log import AgentAuditLog
from backend.models.user import UserRole

from .conftest import (
    as_business,
    as_owner,
    auth,
    make_business,
    make_client_row,
    make_user,
)


@pytest.fixture
def tenants(db):
    a, b = make_business(db, "Alpha"), make_business(db, "Beta")
    admin_a = make_user(db, role=UserRole.admin, business=a)
    admin_b = make_user(db, role=UserRole.admin, business=b)
    as_business(db, a.id)
    ca = make_client_row(db, "Alpha client")
    db.add(
        AgentAuditLog(
            id=uuid.uuid4(),
            operation="checkpoint_extract",
            model="gpt-4.1-mini",
            status="success",
            cost_usd="0.25",
        )
    )
    as_business(db, b.id)
    cb = make_client_row(db, "Beta client")
    db.add(
        AgentAuditLog(
            id=uuid.uuid4(),
            operation="checkpoint_extract",
            model="gpt-4.1-mini",
            status="success",
            cost_usd="4.00",
        )
    )
    as_owner(db)
    return admin_a, admin_b, ca, cb


def test_client_list_only_shows_own_business(api, db, tenants):
    admin_a, admin_b, *_ = tenants
    names_a = [
        c["name"]
        for c in api.get("/api/v1/clients", headers=auth(admin_a)).json()
    ]
    names_b = [
        c["name"]
        for c in api.get("/api/v1/clients", headers=auth(admin_b)).json()
    ]
    assert names_a == ["Alpha client"]
    assert names_b == ["Beta client"]


def test_fetching_another_businesss_client_is_404(api, db, tenants):
    admin_a, _, ca, cb = tenants
    h = auth(admin_a)
    assert api.get(f"/api/v1/clients/{ca.id}", headers=h).status_code == 200
    assert api.get(f"/api/v1/clients/{cb.id}", headers=h).status_code == 404


def test_cannot_modify_another_businesss_client(api, db, tenants):
    admin_a, _, _, cb = tenants
    r = api.put(
        f"/api/v1/clients/{cb.id}",
        headers=auth(admin_a),
        json={"name": "pwned"},
    )
    assert r.status_code == 404
    as_owner(db)
    db.refresh(cb)
    assert cb.name == "Beta client"


def test_created_client_lands_in_callers_business(api, db, tenants):
    admin_a, admin_b, *_ = tenants
    r = api.post(
        "/api/v1/clients", headers=auth(admin_a), json={"name": "Fresh"}
    )
    assert r.status_code == 201
    names_a = [
        c["name"]
        for c in api.get("/api/v1/clients", headers=auth(admin_a)).json()
    ]
    names_b = [
        c["name"]
        for c in api.get("/api/v1/clients", headers=auth(admin_b)).json()
    ]
    assert "Fresh" in names_a
    assert "Fresh" not in names_b


def test_user_without_business_sees_no_clients(api, db, tenants):
    legacy = make_user(db, role=UserRole.admin)
    assert api.get("/api/v1/clients", headers=auth(legacy)).json() == []


def test_dashboard_stats_are_scoped_and_report_cost(api, db, tenants):
    admin_a, admin_b, *_ = tenants
    a = api.get("/api/v1/dashboard/stats", headers=auth(admin_a)).json()
    b = api.get("/api/v1/dashboard/stats", headers=auth(admin_b)).json()
    assert (a["total_clients"], a["ai_total_calls"]) == (1, 1)
    assert a["ai_total_cost_usd"] == pytest.approx(0.25)
    assert (b["total_clients"], b["ai_total_calls"]) == (1, 1)
    assert b["ai_total_cost_usd"] == pytest.approx(4.0)


def test_dashboard_cost_is_zero_without_usage(api, db):
    biz = make_business(db)
    user = make_user(db, role=UserRole.admin, business=biz)
    stats = api.get("/api/v1/dashboard/stats", headers=auth(user)).json()
    assert stats["ai_total_cost_usd"] == 0
    assert stats["ai_total_calls"] == 0


def test_superadmin_sees_all_clients(api, db, tenants):
    sa = make_user(db, role=UserRole.superadmin)
    names = {
        c["name"] for c in api.get("/api/v1/clients", headers=auth(sa)).json()
    }
    assert {"Alpha client", "Beta client"} <= names


def test_admin_endpoints_are_closed_to_business_admins(api, db, tenants):
    admin_a, *_ = tenants
    assert (
        api.get("/api/v1/admin/overview", headers=auth(admin_a)).status_code
        == 403
    )
    assert (
        api.get("/api/v1/businesses", headers=auth(admin_a)).status_code == 403
    )
