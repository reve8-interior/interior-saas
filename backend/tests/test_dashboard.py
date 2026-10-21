from datetime import datetime, timedelta
from uuid import uuid4

import pytest

from backend import (
    models,  # noqa: F401  # registers every table on Base.metadata
)
from backend.models.agent_audit_log import AgentAuditLog
from backend.models.checkpoint import Checkpoint
from backend.models.client import Client, ProjectPhase
from backend.models.margin import MarginConfig
from backend.models.quotation import Quotation, QuotationStatus
from backend.models.quotation_line_item import QuotationLineItem
from backend.services.dashboard_service import (
    get_activity_metrics,
    get_ai_usage_metrics,
    get_avg_project_days,
    get_client_metrics,
    get_margin_metrics,
    get_revenue_metrics,
)


def make_client(
    *,
    name: str = "Test Client",
    phase: ProjectPhase | str = ProjectPhase.discussion,
    active: bool = True,
    created_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> Client:
    return Client(
        id=uuid4(),
        name=name,
        contact_info={},
        current_phase=phase,
        is_active=active,
        created_at=created_at or datetime.utcnow(),
        completed_at=completed_at,
    )


def make_quotation(
    client: Client,
    *,
    status: QuotationStatus = QuotationStatus.pending,
) -> Quotation:
    return Quotation(
        id=uuid4(),
        client_id=client.id,
        status=status,
    )


def make_line_item(
    quotation: Quotation,
    *,
    room: str = "Room 1",
    description: str = "Custom wardrobe",
    unit: str = "sqft",
    initial_price: float | None = None,
    negotiated_price: float | None = None,
) -> QuotationLineItem:
    return QuotationLineItem(
        id=uuid4(),
        quotation_id=quotation.id,
        room=room,
        description=description,
        unit=unit,
        initial_price=initial_price,
        negotiated_price=negotiated_price,
    )


def make_audit_log(
    client: Client,
    *,
    operation: str,
    input_tokens: int | None,
    output_tokens: int | None,
    latency_ms: int | None,
) -> AgentAuditLog:
    return AgentAuditLog(
        id=uuid4(),
        client_id=client.id,
        operation=operation,
        model="test-model",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        timestamp=datetime.utcnow(),
    )


def make_margin(*, category: str | None, percent: float) -> MarginConfig:
    return MarginConfig(
        id=uuid4(),
        category=category,
        margin_percent=percent,
    )


def make_checkpoint(client: Client, *, created_at: datetime) -> Checkpoint:
    return Checkpoint(
        id=uuid4(),
        client_id=client.id,
        summary_text="Test checkpoint",
        created_at=created_at,
    )


class TestGetClientMetrics:
    def test_empty_db(self, db):
        total, active, new_this_month, by_phase = get_client_metrics(db)
        assert (total, active, new_this_month) == (0, 0, 0)
        assert by_phase == {}

    def test_counts_and_phases(self, db):
        alice = make_client(name="Alice", phase=ProjectPhase.design)
        bob = make_client(
            name="Bob",
            phase=ProjectPhase.discussion,
            created_at=datetime.utcnow() - timedelta(days=40),
        )
        carol = make_client(
            name="Carol", phase=ProjectPhase.quotation, active=False
        )
        db.add_all([alice, bob, carol])
        db.flush()

        total, active, new_this_month, by_phase = get_client_metrics(db)
        assert (total, active, new_this_month) == (3, 2, 2)
        assert by_phase == {"design": 1, "discussion": 1, "quotation": 1}


class TestGetRevenueMetrics:
    def test_approved_and_pending_revenue(self, db):
        design_client = make_client(phase=ProjectPhase.design)
        quotation_client = make_client(phase=ProjectPhase.quotation)
        approved_q = make_quotation(
            design_client, status=QuotationStatus.approved
        )
        pending_q = make_quotation(quotation_client)
        db.add_all(
            [
                design_client,
                quotation_client,
                approved_q,
                pending_q,
                make_line_item(
                    approved_q,
                    initial_price=60000,
                    negotiated_price=50000,
                ),
                make_line_item(approved_q, initial_price=10000),
                make_line_item(pending_q, initial_price=25000),
            ]
        )
        db.flush()

        approved_rev, pending_rev, by_phase = get_revenue_metrics(db)
        assert approved_rev == 60000.0
        assert pending_rev == 25000.0
        assert by_phase == {"design": 60000.0, "quotation": 25000.0}


class TestGetAiUsageMetrics:
    def test_totals_and_by_operation(self, db):
        client = make_client()
        db.add(client)
        db.flush()

        db.add_all(
            [
                make_audit_log(
                    client,
                    operation="classify_intent",
                    input_tokens=100,
                    output_tokens=50,
                    latency_ms=200,
                ),
                make_audit_log(
                    client,
                    operation="classify_intent",
                    input_tokens=300,
                    output_tokens=100,
                    latency_ms=400,
                ),
                make_audit_log(
                    client,
                    operation="product_search",
                    input_tokens=10,
                    output_tokens=20,
                    latency_ms=100,
                ),
            ]
        )
        db.flush()

        calls, total_in, total_out, avg_latency, by_op = get_ai_usage_metrics(
            db
        )
        assert calls == 3
        assert total_in == 410
        assert total_out == 170
        assert avg_latency == pytest.approx(700 / 3)
        assert by_op == {"classify_intent": 2, "product_search": 1}


class TestGetMarginMetrics:
    def test_global_and_category_margins(self, db):
        db.add_all(
            [
                make_margin(category=None, percent=25.00),
                make_margin(category="kitchen", percent=30.50),
                make_margin(category="bedroom", percent=20.00),
            ]
        )
        db.flush()

        global_pct, by_category = get_margin_metrics(db)
        assert global_pct == pytest.approx(25.0)
        assert by_category == {"kitchen": 30.5, "bedroom": 20.0}


class TestGetActivityMetrics:
    def test_recent_checkpoints_and_pending_quotations(self, db):
        client = make_client()
        now = datetime.utcnow()
        db.add_all(
            [
                client,
                make_checkpoint(client, created_at=now - timedelta(days=10)),
                make_checkpoint(client, created_at=now - timedelta(days=40)),
                make_quotation(client),
                make_quotation(client),
                make_quotation(client, status=QuotationStatus.approved),
            ]
        )
        db.flush()

        recent_checkpoints, quotations_pending = get_activity_metrics(db)
        assert (recent_checkpoints, quotations_pending) == (1, 2)


class TestGetAvgProjectDays:
    def test_average_completion_days(self, db):
        now = datetime.utcnow()
        db.add_all(
            [
                make_client(
                    created_at=now - timedelta(days=20),
                    completed_at=now - timedelta(days=10),
                ),
                make_client(
                    created_at=now - timedelta(days=50),
                    completed_at=now - timedelta(days=20),
                ),
                make_client(created_at=now - timedelta(days=10)),
            ]
        )
        db.flush()

        assert get_avg_project_days(db) == pytest.approx(20.0)


class TestRequiresAuth:
    def test_stats_endpoint_rejects_missing_token(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from backend.routers.dashboard import router

        app = FastAPI()
        app.include_router(router, prefix="/api/v1/dashboard")

        resp = TestClient(app).get("/api/v1/dashboard/stats")
        assert resp.status_code == 401


class TestClientMetricsGrouping:
    def test_every_total_comes_from_the_same_grouped_rows(self, db):
        old = datetime.utcnow() - timedelta(days=60)
        db.add_all(
            [
                make_client(phase=ProjectPhase.design),
                make_client(phase=ProjectPhase.design, active=False),
                make_client(phase=ProjectPhase.design, created_at=old),
                make_client(phase=ProjectPhase.quotation, active=False),
            ]
        )
        db.flush()

        total, active, new_this_month, by_phase = get_client_metrics(db)
        assert total == sum(by_phase.values()) == 4
        assert active == 2
        assert new_this_month == 3
        assert by_phase == {"design": 3, "quotation": 1}

    def test_inactive_clients_still_count_toward_total_and_phase(self, db):
        db.add(make_client(phase=ProjectPhase.discussion, active=False))
        db.flush()

        total, active, _, by_phase = get_client_metrics(db)
        assert (total, active) == (1, 0)
        assert by_phase == {"discussion": 1}

    def test_month_start_boundary_is_inclusive(self, db):
        month_start = datetime.utcnow().replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        db.add_all(
            [
                make_client(created_at=month_start - timedelta(seconds=1)),
                make_client(created_at=month_start),
            ]
        )
        db.flush()

        assert get_client_metrics(db)[2] == 1

    def test_runs_as_a_single_query(self, db):
        from sqlalchemy import event

        statements: list[str] = []

        def record(conn, cursor, statement, *rest):
            statements.append(statement)

        engine = db.get_bind()
        event.listen(engine, "before_cursor_execute", record)
        try:
            get_client_metrics(db)
        finally:
            event.remove(engine, "before_cursor_execute", record)
        assert len(statements) == 1


class TestRevenueMetricsPriceFallbacks:
    def test_empty_db_returns_zeroes(self, db):
        assert get_revenue_metrics(db) == (0, 0, {})

    def test_approved_prefers_negotiated_then_initial(self, db):
        client = make_client(phase=ProjectPhase.design)
        q = make_quotation(client, status=QuotationStatus.approved)
        db.add_all(
            [
                client,
                q,
                make_line_item(q, initial_price=100, negotiated_price=80),
                make_line_item(q, initial_price=50),
                make_line_item(q, negotiated_price=30),
            ]
        )
        db.flush()

        approved, pending, _ = get_revenue_metrics(db)
        assert approved == 160.0
        assert pending == 0

    def test_pending_prefers_initial_then_negotiated(self, db):
        client = make_client(phase=ProjectPhase.quotation)
        q = make_quotation(client)
        db.add_all(
            [
                client,
                q,
                make_line_item(q, initial_price=100, negotiated_price=80),
                make_line_item(q, negotiated_price=30),
            ]
        )
        db.flush()

        approved, pending, _ = get_revenue_metrics(db)
        assert approved == 0
        assert pending == 130.0

    def test_line_items_without_prices_contribute_nothing(self, db):
        client = make_client()
        q = make_quotation(client, status=QuotationStatus.approved)
        db.add_all([client, q, make_line_item(q)])
        db.flush()

        assert get_revenue_metrics(db)[0] == 0

    def test_approved_and_pending_do_not_bleed_into_each_other(self, db):
        client = make_client()
        approved_q = make_quotation(client, status=QuotationStatus.approved)
        pending_q = make_quotation(client)
        db.add_all(
            [
                client,
                approved_q,
                pending_q,
                make_line_item(approved_q, initial_price=10),
                make_line_item(pending_q, initial_price=20),
            ]
        )
        db.flush()

        approved, pending, _ = get_revenue_metrics(db)
        assert (approved, pending) == (10.0, 20.0)


class TestAiUsageMetricsEdgeCases:
    def test_empty_db_returns_zeroes(self, db):
        assert get_ai_usage_metrics(db) == (0, 0, 0, 0, {})

    def test_null_token_and_latency_columns_are_ignored(self, db):
        client = make_client()
        db.add(client)
        db.flush()
        db.add_all(
            [
                make_audit_log(
                    client,
                    operation="extract",
                    input_tokens=None,
                    output_tokens=None,
                    latency_ms=None,
                ),
                make_audit_log(
                    client,
                    operation="extract",
                    input_tokens=40,
                    output_tokens=10,
                    latency_ms=300,
                ),
            ]
        )
        db.flush()

        calls, tokens_in, tokens_out, avg_latency, by_op = (
            get_ai_usage_metrics(db)
        )
        assert (calls, tokens_in, tokens_out) == (2, 40, 10)
        assert avg_latency == pytest.approx(300)
        assert by_op == {"extract": 2}
