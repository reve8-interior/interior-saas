"""Billing edge cases: hostile webhooks, ordering, money, state transitions."""

import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from backend.core.config import settings
from backend.models.audit import AuditLog
from backend.models.payment_event import PaymentEvent
from backend.models.plan import Plan
from backend.models.user import UserRole
from backend.routers.billing import MAX_WEBHOOK_BYTES
from backend.services.razorpay_client import RazorpayError

from .conftest import as_owner, auth, make_user
from .test_billing import (  # noqa: F401  # fixtures are used by name
    KEY_SECRET,
    WEBHOOK,
    WEBHOOK_SECRET,
    _razorpay_settings,
    order_paid_event,
    post_event,
    rzp,
    sign,
    subscription_event,
    sync_solo,
    tenant,
)

CHECKOUT = "/api/v1/billing/checkout"
CANCEL = "/api/v1/billing/cancel"
STATUS = "/api/v1/billing/status"
VERIFY = "/api/v1/billing/verify"
STUDIO_YEARLY_PAISE = 9990 * 100


def at(event: dict, when: datetime) -> dict:
    """Stamp a webhook with the provider's `created_at`."""
    event["created_at"] = int(when.timestamp())
    return event


def now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def stored(db, event_id: str) -> PaymentEvent:
    as_owner(db)
    return db.query(PaymentEvent).filter_by(razorpay_event_id=event_id).one()


def reload(db, biz):
    as_owner(db)
    db.refresh(biz)
    return biz


def subscribed(db, **kw):
    """A tenant on a live monthly Solo subscription."""
    fields = {
        "plan": "solo",
        "billing_cycle": "monthly",
        "subscription_status": "active",
        "razorpay_subscription_id": "sub_1",
    }
    fields.update(kw)
    return tenant(db, **fields)


# --- webhook transport -------------------------------------------------------


def test_oversized_webhook_body_is_rejected_before_parsing(api, db):
    raw = b"x" * (MAX_WEBHOOK_BYTES + 1)
    r = api.post(
        WEBHOOK,
        content=raw,
        headers={
            "X-Razorpay-Signature": sign(WEBHOOK_SECRET, raw),
            "X-Razorpay-Event-Id": "evt_big",
        },
    )
    assert r.status_code == 413
    assert db.query(PaymentEvent).count() == 0


def test_webhook_without_a_signature_header_is_rejected(api, db):
    r = api.post(
        WEBHOOK,
        content=b"{}",
        headers={"X-Razorpay-Event-Id": "evt_1"},
    )
    assert r.status_code == 400
    assert db.query(PaymentEvent).count() == 0


@pytest.mark.parametrize("body", [b"not json", b"[1, 2]", b'"text"', b"null"])
def test_signed_but_malformed_payloads_are_rejected(api, db, body):
    r = api.post(
        WEBHOOK,
        content=body,
        headers={
            "X-Razorpay-Signature": sign(WEBHOOK_SECRET, body),
            "X-Razorpay-Event-Id": "evt_bad",
        },
    )
    assert r.status_code == 400
    assert db.query(PaymentEvent).count() == 0


def test_webhook_needs_no_login_but_a_signature_made_with_another_secret_fails(
    api, db
):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    event = subscription_event("subscription.activated", biz, end=now())
    r = post_event(api, event, secret="someone-elses-secret")
    assert r.status_code == 400
    assert reload(db, biz).plan == "free"


def test_webhook_response_never_echoes_account_data(api, db):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    event = subscription_event(
        "subscription.activated", biz, end=now() + timedelta(days=30)
    )
    r = post_event(api, event)
    assert r.json() == {"status": "processed"}


# --- idempotency and races ---------------------------------------------------


def test_a_concurrent_redelivery_is_a_duplicate_not_a_server_error(
    api, db, monkeypatch
):
    as_owner(db)
    db.add(
        PaymentEvent(
            razorpay_event_id="evt_race",
            event_type="refund.created",
            payload={},
            processed_at=now(),
        )
    )
    db.flush()
    # The other delivery committed after our duplicate check ran.
    monkeypatch.setattr(db, "scalar", lambda *a, **k: None)
    r = post_event(api, {"event": "refund.created"}, event_id="evt_race")
    assert r.status_code == 200
    assert r.json() == {"status": "duplicate"}


def test_a_duplicate_does_not_write_a_second_audit_row(api, db):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    event = subscription_event(
        "subscription.activated", biz, end=now() + timedelta(days=30)
    )
    post_event(api, event)
    post_event(api, event)
    as_owner(db)
    rows = (
        db.query(AuditLog)
        .filter_by(business_id=biz.id, action="billing.subscription.activated")
        .count()
    )
    assert rows == 1


def test_distinct_event_ids_with_the_same_content_both_apply(api, db):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    first = now() + timedelta(days=30)
    post_event(
        api,
        subscription_event("subscription.charged", biz, end=first),
        event_id="evt_a",
    )
    second = first + timedelta(days=30)
    post_event(
        api,
        subscription_event("subscription.charged", biz, end=second),
        event_id="evt_b",
    )
    assert int(reload(db, biz).current_period_end.timestamp()) == int(
        second.timestamp()
    )


# --- out-of-order delivery ---------------------------------------------------


def test_an_older_event_cannot_undo_a_newer_one(api, db):
    biz, _ = subscribed(db)
    t = now()
    end = t + timedelta(days=30)
    post_event(
        api,
        at(subscription_event("subscription.cancelled", biz, end=end), t),
        event_id="evt_new",
    )
    late = at(
        subscription_event(
            "subscription.charged", biz, end=end + timedelta(days=30)
        ),
        t - timedelta(minutes=5),
    )
    r = post_event(api, late, event_id="evt_old")
    assert r.status_code == 200
    biz = reload(db, biz)
    assert biz.subscription_status == "cancelled"
    assert int(biz.current_period_end.timestamp()) == int(end.timestamp())
    assert stored(db, "evt_old").payload["outcome"] == "stale"


def test_a_stale_event_does_not_move_the_high_water_mark(api, db):
    biz, _ = subscribed(db)
    t = now()
    post_event(
        api,
        at(
            subscription_event(
                "subscription.charged", biz, end=t + timedelta(days=30)
            ),
            t,
        ),
        event_id="evt_1",
    )
    post_event(
        api,
        at(
            subscription_event("subscription.halted", biz, end=t),
            t - timedelta(hours=1),
        ),
        event_id="evt_2",
    )
    assert int(reload(db, biz).last_billing_event_at.timestamp()) == int(
        t.timestamp()
    )


def test_events_with_the_same_timestamp_both_apply(api, db):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    t = now()
    end = t + timedelta(days=30)
    post_event(
        api,
        at(subscription_event("subscription.activated", biz, end=end), t),
        event_id="evt_1",
    )
    post_event(
        api,
        at(subscription_event("subscription.charged", biz, end=end), t),
        event_id="evt_2",
    )
    assert stored(db, "evt_2").payload["outcome"] == "applied"


def test_events_without_a_timestamp_still_apply(api, db):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    post_event(
        api,
        subscription_event(
            "subscription.activated", biz, end=now() + timedelta(days=30)
        ),
    )
    biz = reload(db, biz)
    assert biz.plan == "solo"
    assert biz.last_billing_event_at is None


def test_recovery_after_a_halt_reactivates_on_resume(api, db):
    biz, _ = subscribed(db, subscription_status="halted")
    end = now() + timedelta(days=30)
    post_event(api, subscription_event("subscription.resumed", biz, end=end))
    biz = reload(db, biz)
    assert biz.subscription_status == "active"
    assert int(biz.current_period_end.timestamp()) == int(end.timestamp())


# --- subscription lifecycle --------------------------------------------------


def test_completed_subscription_keeps_access_until_the_end(api, db):
    biz, _ = subscribed(db)
    end = now() + timedelta(days=3)
    post_event(api, subscription_event("subscription.completed", biz, end=end))
    biz = reload(db, biz)
    assert biz.subscription_status == "completed"
    assert biz.plan == "solo"
    assert int(biz.access_expires_at.timestamp()) == int(end.timestamp())


def test_pending_renewal_keeps_the_plan_and_period(api, db):
    biz, _ = subscribed(db)
    before = now() + timedelta(days=2)
    biz.current_period_end = before
    biz.access_expires_at = before
    db.flush()
    post_event(
        api,
        subscription_event(
            "subscription.pending", biz, end=now() + timedelta(days=60)
        ),
    )
    biz = reload(db, biz)
    assert biz.subscription_status == "pending"
    assert biz.plan == "solo"
    assert int(biz.current_period_end.timestamp()) == int(before.timestamp())


def test_activation_without_a_period_end_keeps_the_existing_one(api, db):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    before = now() + timedelta(days=9)
    biz.current_period_end = before
    db.flush()
    event = subscription_event("subscription.activated", biz, end=now())
    del event["payload"]["subscription"]["entity"]["current_end"]
    post_event(api, event)
    biz = reload(db, biz)
    assert biz.plan == "solo"
    assert int(biz.current_period_end.timestamp()) == int(before.timestamp())


@pytest.mark.parametrize("bad_end", ["tomorrow", None, True, [], {}])
def test_a_garbage_period_end_never_crashes_or_moves_access(api, db, bad_end):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    event = subscription_event("subscription.charged", biz, end=now())
    event["payload"]["subscription"]["entity"]["current_end"] = bad_end
    r = post_event(api, event)
    assert r.status_code == 200
    assert reload(db, biz).current_period_end is None


@pytest.mark.parametrize("slug", ["", "free", "enterprise-xyz", "../admin"])
def test_activation_for_an_unknown_or_free_plan_changes_nothing(api, db, slug):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    event = subscription_event(
        "subscription.activated",
        biz,
        end=now() + timedelta(days=30),
        slug=slug,
    )
    post_event(api, event)
    biz = reload(db, biz)
    assert biz.plan == "free"
    assert biz.subscription_status == "none"
    assert stored(db, "evt_1").payload["outcome"] == "ignored"


def test_halted_payment_keeps_the_paid_period(api, db):
    biz, _ = subscribed(db)
    end = now() + timedelta(days=4)
    biz.current_period_end = end
    biz.access_expires_at = end
    db.flush()
    post_event(
        api,
        subscription_event(
            "subscription.halted", biz, end=now() + timedelta(days=90)
        ),
    )
    biz = reload(db, biz)
    assert biz.subscription_status == "halted"
    assert int(biz.access_expires_at.timestamp()) == int(end.timestamp())


def test_a_failed_payment_is_recorded_without_touching_access(api, db):
    biz, _ = subscribed(db)
    event = {
        "event": "payment.failed",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_1",
                    "status": "failed",
                    "amount": 49900,
                    "notes": {"business_id": str(biz.id)},
                }
            }
        },
    }
    post_event(api, event)
    biz = reload(db, biz)
    assert biz.plan == "solo"
    assert biz.subscription_status == "active"
    row = stored(db, "evt_1")
    assert row.business_id == biz.id
    assert row.payload["payment"]["id"] == "pay_1"


def test_events_are_scoped_to_the_business_in_their_notes(api, db):
    one, _ = tenant(db)
    one.razorpay_subscription_id = "sub_1"
    as_owner(db)
    other, _ = tenant(db)
    other.razorpay_subscription_id = "sub_2"
    post_event(
        api,
        subscription_event(
            "subscription.activated", one, end=now() + timedelta(days=30)
        ),
    )
    assert reload(db, one).plan == "solo"
    assert reload(db, other).plan == "free"
    assert reload(db, other).subscription_status == "none"


@pytest.mark.parametrize(
    "notes",
    [
        {},
        {"business_id": ""},
        {"business_id": "not-a-uuid"},
        {"business_id": str(uuid.uuid4())},
        {"business_id": None},
        {"business_id": 12345},
    ],
)
def test_events_for_no_known_business_are_acknowledged_and_logged(
    api, db, notes
):
    event = {
        "event": "subscription.activated",
        "payload": {
            "subscription": {"entity": {"id": "sub_x", "notes": notes}}
        },
    }
    r = post_event(api, event)
    assert r.status_code == 200
    row = stored(db, "evt_1")
    assert row.business_id is None


@pytest.mark.parametrize(
    "event",
    [
        {},
        {"event": None},
        {"event": "refund.processed"},
        {"event": "payment.captured", "payload": None},
        {"event": "order.paid", "payload": {"order": None}},
        {"event": "subscription.charged", "payload": {"subscription": {}}},
    ],
)
def test_odd_events_are_acknowledged_without_crashing(api, db, event):
    assert post_event(api, event).status_code == 200


def test_every_applied_event_leaves_an_audit_trail(api, db):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    post_event(
        api,
        subscription_event(
            "subscription.activated", biz, end=now() + timedelta(days=30)
        ),
    )
    as_owner(db)
    entry = (
        db.query(AuditLog)
        .filter_by(business_id=biz.id, action="billing.subscription.activated")
        .one()
    )
    assert entry.payload == {
        "plan": "solo",
        "status": "active",
        "outcome": "applied",
    }
    assert entry.user_id is None


# --- yearly orders: the money checks ----------------------------------------


def test_underpaid_order_does_not_grant_the_plan(api, db):
    biz, _ = tenant(db)
    event = order_paid_event(biz)
    event["payload"]["order"]["entity"]["amount"] = STUDIO_YEARLY_PAISE - 1
    post_event(api, event)
    biz = reload(db, biz)
    assert biz.plan == "free"
    assert biz.billing_cycle is None
    assert stored(db, "evt_1").payload["outcome"] == "ignored"


def test_the_amount_actually_paid_beats_the_order_total(api, db):
    biz, _ = tenant(db)
    event = order_paid_event(biz)
    entity = event["payload"]["order"]["entity"]
    entity["amount"] = STUDIO_YEARLY_PAISE
    entity["amount_paid"] = 0
    post_event(api, event)
    assert reload(db, biz).plan == "free"


def test_exact_and_over_payment_both_grant_the_plan(api, db):
    exact, _ = tenant(db)
    post_event(api, order_paid_event(exact), event_id="evt_exact")
    assert reload(db, exact).plan == "studio"

    over, _ = tenant(db)
    event = order_paid_event(over)
    event["payload"]["order"]["entity"]["amount_paid"] = (
        STUDIO_YEARLY_PAISE * 2
    )
    post_event(api, event, event_id="evt_over")
    assert reload(db, over).plan == "studio"


@pytest.mark.parametrize("amount", ["999000", None, 9990.5, [], True])
def test_a_non_integer_amount_never_grants_a_plan(api, db, amount):
    biz, _ = tenant(db)
    event = order_paid_event(biz)
    entity = event["payload"]["order"]["entity"]
    entity.pop("amount", None)
    entity["amount_paid"] = amount
    post_event(api, event)
    assert reload(db, biz).plan == "free"


@pytest.mark.parametrize("slug", ["free", "nope", "", "../x"])
def test_orders_for_free_or_unknown_plans_grant_nothing(api, db, slug):
    biz, _ = tenant(db)
    post_event(api, order_paid_event(biz, slug=slug))
    assert reload(db, biz).plan == "free"


def test_an_order_not_marked_yearly_grants_nothing(api, db):
    biz, _ = tenant(db)
    event = order_paid_event(biz)
    event["payload"]["order"]["entity"]["notes"]["cycle"] = "monthly"
    post_event(api, event)
    assert reload(db, biz).plan == "free"


def test_yearly_renewal_after_expiry_starts_from_today(api, db):
    biz, _ = tenant(db, plan="studio", billing_cycle="yearly")
    biz.current_period_end = now() - timedelta(days=40)
    db.flush()
    post_event(api, order_paid_event(biz))
    biz = reload(db, biz)
    expected = datetime.now(UTC) + timedelta(days=365)
    assert abs((biz.current_period_end - expected).total_seconds()) < 60
    assert biz.access_expires_at == biz.current_period_end


def test_an_upgrade_by_order_switches_the_plan_and_keeps_paid_time(api, db):
    biz, _ = tenant(db, plan="solo", billing_cycle="yearly")
    current = now() + timedelta(days=100)
    biz.current_period_end = current
    db.flush()
    post_event(api, order_paid_event(biz, slug="studio"))
    biz = reload(db, biz)
    assert biz.plan == "studio"
    assert biz.current_period_end == current + timedelta(days=365)


def test_a_yearly_payment_clears_a_halted_monthly_state(api, db):
    biz, _ = subscribed(db, subscription_status="halted")
    post_event(api, order_paid_event(biz))
    biz = reload(db, biz)
    assert biz.billing_cycle == "yearly"
    assert biz.subscription_status == "active"


# --- checkout ----------------------------------------------------------------


def checkout(api, user, plan="studio", cycle="yearly", **extra):
    return api.post(
        CHECKOUT,
        headers=auth(user),
        json={"plan_slug": plan, "billing_cycle": cycle, **extra},
    )


def test_checkout_requires_login(api, db, rzp):
    tenant(db)
    r = api.post(
        CHECKOUT, json={"plan_slug": "studio", "billing_cycle": "yearly"}
    )
    assert r.status_code == 401


@pytest.mark.parametrize(
    "body",
    [
        {"plan_slug": "Studio!", "billing_cycle": "yearly"},
        {"plan_slug": "", "billing_cycle": "yearly"},
        {"plan_slug": "studio", "billing_cycle": "weekly"},
        {"plan_slug": "studio"},
        {"billing_cycle": "yearly"},
        {},
    ],
)
def test_malformed_checkout_requests_are_rejected(api, db, rzp, body):
    _, user = tenant(db)
    r = api.post(CHECKOUT, headers=auth(user), json=body)
    assert r.status_code == 422
    rzp.create_order.assert_not_called()
    rzp.create_subscription.assert_not_called()


def test_the_client_cannot_choose_the_price(api, db, rzp):
    _, user = tenant(db)
    r = checkout(api, user, amount=1, amount_inr=1, price=1)
    assert r.status_code == 200
    assert r.json()["amount_inr"] == 9990
    assert rzp.create_order.call_args.args[0] == STUDIO_YEARLY_PAISE


def test_the_order_carries_the_business_and_plan_for_the_webhook(api, db, rzp):
    biz, user = tenant(db)
    checkout(api, user)
    notes = rzp.create_order.call_args.args[2]
    assert notes == {
        "business_id": str(biz.id),
        "plan_slug": "studio",
        "cycle": "yearly",
    }


def test_a_yearly_plan_without_a_yearly_price_cannot_be_bought(api, db, rzp):
    _, user = tenant(db)
    db.query(Plan).filter_by(slug="studio").one().price_yearly_inr = None
    db.flush()
    assert checkout(api, user).status_code == 409
    rzp.create_order.assert_not_called()


def test_an_abandoned_checkout_can_be_retried(api, db, rzp):
    biz, user = tenant(
        db,
        billing_cycle="monthly",
        subscription_status="created",
        razorpay_subscription_id="sub_old",
    )
    sync_solo(db)
    rzp.create_subscription.return_value = {"id": "sub_new"}
    r = checkout(api, user, plan="solo", cycle="monthly")
    assert r.status_code == 200
    assert reload(db, biz).razorpay_subscription_id == "sub_new"


@pytest.mark.parametrize("state", ["halted", "cancelled", "completed"])
def test_a_dead_subscription_does_not_block_a_new_one(api, db, rzp, state):
    biz, user = subscribed(db, subscription_status=state)
    sync_solo(db)
    rzp.create_subscription.return_value = {"id": "sub_2"}
    r = checkout(api, user, plan="solo", cycle="monthly")
    assert r.status_code == 200
    assert reload(db, biz).razorpay_subscription_id == "sub_2"


@pytest.mark.parametrize("state", ["active", "pending"])
def test_a_live_monthly_subscription_blocks_every_checkout(
    api, db, rzp, state
):
    _, user = subscribed(db, subscription_status=state)
    sync_solo(db)
    assert checkout(api, user, plan="solo", cycle="monthly").status_code == 409
    assert (
        checkout(api, user, plan="studio", cycle="yearly").status_code == 409
    )
    rzp.create_order.assert_not_called()
    rzp.create_subscription.assert_not_called()


def test_an_active_yearly_customer_can_renew_early(api, db, rzp):
    _, user = tenant(
        db,
        plan="studio",
        billing_cycle="yearly",
        subscription_status="active",
    )
    r = checkout(api, user)
    assert r.status_code == 200
    assert r.json()["kind"] == "order"


def test_a_provider_failure_leaves_the_business_untouched(api, db, rzp):
    biz, user = tenant(db)
    sync_solo(db)
    rzp.create_subscription.side_effect = RazorpayError("down")
    r = checkout(api, user, plan="solo", cycle="monthly")
    assert r.status_code == 502
    biz = reload(db, biz)
    assert biz.razorpay_subscription_id is None
    assert biz.subscription_status == "none"
    assert biz.billing_cycle is None


def test_the_first_month_offer_is_not_repeated_after_a_cancellation(
    api, db, rzp, monkeypatch
):
    monkeypatch.setattr(settings, "razorpay_first_month_offer_id", "offer_1")
    _, user = subscribed(db, subscription_status="cancelled")
    sync_solo(db)
    r = checkout(api, user, plan="solo", cycle="monthly")
    assert r.json()["first_month_offer"] is False
    assert rzp.create_subscription.call_args.args[2] is None


def test_checkout_cannot_target_another_business(api, db, rzp):
    mine, user = tenant(db)
    as_owner(db)
    theirs, _ = tenant(db)
    sync_solo(db)
    checkout(
        api, user, plan="solo", cycle="monthly", business_id=str(theirs.id)
    )
    assert rzp.create_subscription.call_args.args[1]["business_id"] == str(
        mine.id
    )
    assert reload(db, theirs).razorpay_subscription_id is None


# --- cancel ------------------------------------------------------------------


def test_cancelling_is_recorded_against_the_person_who_did_it(api, db, rzp):
    biz, user = subscribed(db)
    assert api.post(CANCEL, headers=auth(user)).status_code == 200
    as_owner(db)
    entry = (
        db.query(AuditLog)
        .filter_by(business_id=biz.id, action="billing.cancel_requested")
        .one()
    )
    assert entry.user_id == user.id


def test_a_provider_failure_on_cancel_keeps_the_subscription(api, db, rzp):
    biz, user = subscribed(db)
    rzp.cancel_subscription.side_effect = RazorpayError("provider down")
    r = api.post(CANCEL, headers=auth(user))
    assert r.status_code == 502
    assert reload(db, biz).subscription_status == "active"
    as_owner(db)
    assert (
        db.query(AuditLog)
        .filter_by(business_id=biz.id, action="billing.cancel_requested")
        .count()
        == 0
    )


def test_cancelling_twice_only_calls_the_provider_once(api, db, rzp):
    _, user = subscribed(db)
    assert api.post(CANCEL, headers=auth(user)).status_code == 200
    assert api.post(CANCEL, headers=auth(user)).status_code == 409
    assert rzp.cancel_subscription.call_count == 1


def test_a_pending_subscription_can_be_cancelled(api, db, rzp):
    _, user = subscribed(db, subscription_status="pending")
    assert api.post(CANCEL, headers=auth(user)).status_code == 200


@pytest.mark.parametrize(
    "fields",
    [
        {"billing_cycle": "yearly", "subscription_status": "active"},
        {"subscription_status": "halted"},
        {"subscription_status": "created"},
        {"subscription_status": "completed"},
        {"razorpay_subscription_id": None},
    ],
)
def test_only_a_live_monthly_subscription_can_be_cancelled(
    api, db, rzp, fields
):
    _, user = subscribed(db, **fields)
    assert api.post(CANCEL, headers=auth(user)).status_code == 409
    rzp.cancel_subscription.assert_not_called()


def test_only_the_admin_can_cancel(api, db, rzp):
    biz, _ = subscribed(db)
    designer = make_user(db, role=UserRole.designer, business=biz)
    as_owner(db)
    assert api.post(CANCEL, headers=auth(designer)).status_code == 403
    rzp.cancel_subscription.assert_not_called()
    assert api.post(CANCEL).status_code == 401


def test_cancelling_keeps_the_plan_and_the_paid_period(api, db, rzp):
    biz, user = subscribed(db)
    end = now() + timedelta(days=10)
    biz.current_period_end = end
    biz.access_expires_at = end
    db.flush()
    api.post(CANCEL, headers=auth(user))
    biz = reload(db, biz)
    assert biz.plan == "solo"
    assert biz.access_expires_at == end


# --- status ------------------------------------------------------------------


def test_status_is_private_to_the_business_admin(api, db):
    biz, _ = tenant(db)
    designer = make_user(db, role=UserRole.designer, business=biz)
    as_owner(db)
    assert api.get(STATUS, headers=auth(designer)).status_code == 403
    assert api.get(STATUS).status_code == 401


def test_status_reports_payments_off_without_keys(api, db, monkeypatch):
    monkeypatch.setattr(settings, "razorpay_key_id", "")
    _, user = tenant(db)
    assert (
        api.get(STATUS, headers=auth(user)).json()["payments_enabled"] is False
    )


def test_status_shows_the_offer_only_before_the_first_subscription(
    api, db, monkeypatch
):
    monkeypatch.setattr(settings, "razorpay_first_month_offer_id", "offer_1")
    _, fresh = tenant(db)
    as_owner(db)
    assert (
        api.get(STATUS, headers=auth(fresh)).json()[
            "first_month_offer_available"
        ]
        is True
    )
    as_owner(db)
    _, returning = subscribed(db, subscription_status="cancelled")
    assert (
        api.get(STATUS, headers=auth(returning)).json()[
            "first_month_offer_available"
        ]
        is False
    )


def test_status_never_exposes_provider_ids(api, db):
    _, user = subscribed(db)
    body = json.dumps(api.get(STATUS, headers=auth(user)).json())
    assert "sub_1" not in body


# --- verify ------------------------------------------------------------------


def test_verify_accepts_a_genuine_order_signature(api, db):
    _, user = tenant(db)
    sig = sign(KEY_SECRET, b"order_1|pay_1")
    r = api.post(
        VERIFY,
        headers=auth(user),
        json={
            "razorpay_order_id": "order_1",
            "razorpay_payment_id": "pay_1",
            "razorpay_signature": sig,
        },
    )
    assert r.json() == {"verified": True}


def test_verify_rejects_a_swapped_payment_id(api, db):
    _, user = tenant(db)
    sig = sign(KEY_SECRET, b"order_1|pay_1")
    r = api.post(
        VERIFY,
        headers=auth(user),
        json={
            "razorpay_order_id": "order_1",
            "razorpay_payment_id": "pay_other",
            "razorpay_signature": sig,
        },
    )
    assert r.json() == {"verified": False}


def test_verify_fails_closed_when_the_secret_is_missing(api, db, monkeypatch):
    monkeypatch.setattr(settings, "razorpay_key_secret", "")
    _, user = tenant(db)
    sig = sign("", b"order_1|pay_1")
    r = api.post(
        VERIFY,
        headers=auth(user),
        json={
            "razorpay_order_id": "order_1",
            "razorpay_payment_id": "pay_1",
            "razorpay_signature": sig,
        },
    )
    assert r.json() == {"verified": False}


def test_verify_requires_login_and_a_reference(api, db):
    _, user = tenant(db)
    body = {"razorpay_payment_id": "pay_1", "razorpay_signature": "s"}
    assert api.post(VERIFY, json=body).status_code == 401
    assert api.post(VERIFY, headers=auth(user), json=body).status_code == 422


def test_a_verified_payment_alone_never_upgrades_the_plan(api, db):
    biz, user = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    sig = sign(KEY_SECRET, b"pay_1|sub_1")
    r = api.post(
        VERIFY,
        headers=auth(user),
        json={
            "razorpay_subscription_id": "sub_1",
            "razorpay_payment_id": "pay_1",
            "razorpay_signature": sig,
        },
    )
    assert r.json() == {"verified": True}
    assert reload(db, biz).plan == "free"


# --- admin plan sync ---------------------------------------------------------


def test_a_failed_sync_leaves_the_plan_unchanged(api, db, rzp):
    admin = make_user(db, role=UserRole.superadmin)
    from backend.services.plan_limits import seed_plans

    seed_plans(db)
    solo = db.query(Plan).filter_by(slug="solo").one()
    rzp.create_plan.side_effect = RazorpayError("down")
    r = api.post(
        f"/api/v1/admin/plans/{solo.id}/sync-razorpay", headers=auth(admin)
    )
    assert r.status_code == 502
    db.refresh(solo)
    assert solo.razorpay_plan_id_monthly is None
    assert solo.razorpay_plan_price_inr is None


def test_syncing_an_unknown_plan_is_a_404(api, db, rzp):
    admin = make_user(db, role=UserRole.superadmin)
    r = api.post(
        f"/api/v1/admin/plans/{uuid.uuid4()}/sync-razorpay",
        headers=auth(admin),
    )
    assert r.status_code == 404
    rzp.create_plan.assert_not_called()


def test_sync_requires_login(api, db, rzp):
    r = api.post(f"/api/v1/admin/plans/{uuid.uuid4()}/sync-razorpay")
    assert r.status_code == 401
