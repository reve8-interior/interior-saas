"""Postgres RLS: a scoped session only ever sees its own business's rows."""

import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from backend.models.agent_audit_log import AgentAuditLog
from backend.models.checkpoint import Checkpoint
from backend.models.client import Client
from backend.models.quotation import Quotation
from backend.models.quotation_line_item import QuotationLineItem

from .conftest import (
    as_business,
    as_owner,
    make_business,
    make_client_row,
    make_user,
)


@pytest.fixture
def two_businesses(db):
    """Business A with 2 clients, business B with 1, plus one orphan client."""
    a, b = make_business(db, "A"), make_business(db, "B")
    as_business(db, a.id)
    a_clients = [make_client_row(db, "A1"), make_client_row(db, "A2")]
    as_business(db, b.id)
    b_clients = [make_client_row(db, "B1")]
    as_owner(db)
    orphan = make_client_row(db, "Orphan")
    return a, b, a_clients, b_clients, orphan


def names(db):
    return sorted(db.scalars(select(Client.name)).all())


def test_each_business_sees_only_its_clients(db, two_businesses):
    a, b, *_ = two_businesses
    as_business(db, a.id)
    assert names(db) == ["A1", "A2"]
    as_business(db, b.id)
    assert names(db) == ["B1"]


def test_owner_sees_everything_including_orphans(db, two_businesses):
    as_owner(db)
    assert names(db) == ["A1", "A2", "B1", "Orphan"]


def test_user_without_business_sees_nothing(db, two_businesses):
    as_business(db, None)
    assert names(db) == []


def test_insert_is_stamped_with_callers_business(db, two_businesses):
    a, *_ = two_businesses
    as_business(db, a.id)
    created = make_client_row(db, "A3")
    db.refresh(created)
    assert created.business_id == a.id


def test_cannot_insert_into_another_business(db, two_businesses):
    a, b, *_ = two_businesses
    as_business(db, a.id)
    with pytest.raises(DBAPIError):
        make_client_row(db, "Sneaky", business_id=b.id)


def test_cannot_update_or_delete_other_business_rows(db, two_businesses):
    a, b, _, b_clients, _ = two_businesses
    other_id = b_clients[0].id
    as_business(db, a.id)
    updated = db.execute(
        text("UPDATE clients SET name = 'pwned' WHERE id = :i"),
        {"i": other_id},
    ).rowcount
    deleted = db.execute(
        text("DELETE FROM clients WHERE id = :i"), {"i": other_id}
    ).rowcount
    assert (updated, deleted) == (0, 0)
    as_owner(db)
    assert "B1" in names(db)


def test_get_by_primary_key_respects_scope(db, two_businesses):
    a, b, _, b_clients, _ = two_businesses
    other_id = b_clients[0].id
    as_business(db, a.id)
    db.expire_all()
    assert db.get(Client, other_id) is None


def test_child_tables_follow_their_client(db, two_businesses):
    a, b, a_clients, b_clients, _ = two_businesses
    as_business(db, a.id)
    quote = Quotation(id=uuid.uuid4(), client_id=a_clients[0].id)
    db.add(quote)
    db.add(
        Checkpoint(
            id=uuid.uuid4(), client_id=a_clients[0].id, summary_text="s"
        )
    )
    db.flush()
    db.add(
        QuotationLineItem(
            id=uuid.uuid4(),
            quotation_id=quote.id,
            room="R",
            description="d",
            unit="sqft",
        )
    )
    db.flush()

    as_business(db, a.id)
    assert db.scalar(select(text("count(*)")).select_from(Quotation)) == 1
    assert db.scalar(select(text("count(*)")).select_from(Checkpoint)) == 1
    assert (
        db.scalar(select(text("count(*)")).select_from(QuotationLineItem)) == 1
    )

    as_business(db, b.id)
    assert db.scalar(select(text("count(*)")).select_from(Quotation)) == 0
    assert db.scalar(select(text("count(*)")).select_from(Checkpoint)) == 0
    assert (
        db.scalar(select(text("count(*)")).select_from(QuotationLineItem)) == 0
    )


def test_cannot_attach_child_to_other_business_client(db, two_businesses):
    a, b, _, b_clients, _ = two_businesses
    as_business(db, a.id)
    with pytest.raises(DBAPIError):
        db.add(Quotation(id=uuid.uuid4(), client_id=b_clients[0].id))
        db.flush()


def test_audit_log_scoped_and_stamped(db, two_businesses):
    a, b, *_ = two_businesses
    as_business(db, a.id)
    log = AgentAuditLog(
        id=uuid.uuid4(), operation="x", model="m", status="success"
    )
    db.add(log)
    db.flush()
    db.refresh(log)
    assert log.business_id == a.id
    assert db.scalar(select(text("count(*)")).select_from(AgentAuditLog)) == 1
    as_business(db, b.id)
    assert db.scalar(select(text("count(*)")).select_from(AgentAuditLog)) == 0


def test_scope_is_reapplied_after_commit(db, two_businesses):
    """Handlers commit mid-request; the next transaction must stay scoped."""
    a, b, *_ = two_businesses
    as_business(db, a.id)
    make_client_row(db, "A3")
    db.commit()
    assert names(db) == ["A1", "A2", "A3"]


def test_apply_rls_is_idempotent(db):
    from backend.rls import apply_rls

    as_owner(db)
    apply_rls(db.connection())
    apply_rls(db.connection())
    count = db.scalar(
        text(
            "SELECT count(*) FROM pg_policies "
            "WHERE policyname = 'business_isolation'"
        )
    )
    assert count == 19


def test_scoped_user_can_update_own_row_when_rls_is_auto_enabled(db):
    """Supabase enables RLS on every table; scoped writes must still match."""
    from backend.rls import apply_rls

    as_owner(db)
    for table in ("users", "businesses"):
        db.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
    apply_rls(db.connection())

    biz = make_business(db, "A")
    user = make_user(db, business=biz)
    as_business(db, biz.id)
    user.full_name = "Renamed"
    db.flush()  # StaleDataError here means the UPDATE matched 0 rows
    assert db.scalar(select(text("full_name")).select_from(type(user))) == (
        "Renamed"
    )


# ── scope_connection: single round trip ──────────────────────────────────────


def current_scope(db):
    return db.execute(
        text("SELECT current_user, current_setting('app.business_id', true)")
    ).one()


def test_scope_connection_sets_role_and_business_together(db):
    from backend.rls import APP_ROLE

    biz = make_business(db, "Scoped")
    as_business(db, biz.id)
    role, setting = current_scope(db)
    assert role == APP_ROLE
    assert setting == str(biz.id)


def test_scope_connection_without_business_uses_no_match_sentinel(db):
    from backend.rls import APP_ROLE, NO_BUSINESS

    as_business(db, None)
    role, setting = current_scope(db)
    assert role == APP_ROLE
    assert setting == str(NO_BUSINESS)


def test_scope_connection_issues_exactly_one_statement():
    from unittest.mock import MagicMock

    from backend.rls import scope_connection

    conn = MagicMock()
    scope_connection(conn, uuid.uuid4())
    assert conn.execute.call_count == 1


def test_scope_connection_binds_role_as_parameter():
    from unittest.mock import MagicMock

    from backend.rls import APP_ROLE, SETTING, scope_connection

    conn = MagicMock()
    biz_id = uuid.uuid4()
    scope_connection(conn, biz_id)
    params = conn.execute.call_args.args[1]
    assert params == {"role": APP_ROLE, "name": SETTING, "value": str(biz_id)}


def test_scope_is_transaction_local(db):
    """is_local=true: the role must not outlive the (sub)transaction."""
    from backend.core.database import scope_session
    from backend.rls import APP_ROLE

    biz = make_business(db, "Tx")
    db.flush()
    nested = db.connection().begin_nested()
    scope_session(db, biz.id)
    assert current_scope(db)[0] == APP_ROLE
    nested.rollback()
    assert current_scope(db)[0] != APP_ROLE


def test_rescoping_switches_business_without_leaking_rows(db, two_businesses):
    a, b, *_ = two_businesses
    for _ in range(3):
        as_business(db, a.id)
        assert names(db) == ["A1", "A2"]
        as_business(db, b.id)
        assert names(db) == ["B1"]
