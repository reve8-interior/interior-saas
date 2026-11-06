"""Changing plans: upgrade now, downgrade at the end of the paid period."""

from datetime import UTC, datetime, timedelta

import pytest

from backend.main import app
from backend.models.audit import AuditLog
from backend.models.payment import Payment
from backend.models.plan import Plan
from backend.models.user import UserRole
from backend.services.plan_change import prorated_upgrade_rupees
from backend.services.plan_limits import get_plan, seed_plans
from backend.services.razorpay_client import (
    RazorpayError,
    get_razorpay,
    get_razorpay_optional,
)

from .conftest import as_owner, auth, make_user
from .test_billing import (  # noqa: F401  # fixtures are used by name
    _razorpay_settings,
    post_event,
    subscription_event,
    tenant,
)
from .test_billing_receipts import payment_entity, with_payment

QUOTE = "/api/v1/billing/change-plan/quote"
CHANGE = "/api/v1/billing/change-plan"
STATUS = "/api/v1/billing/status"
VERIFY = "/api/v1/billing/verify"


@pytest.fixture
def rzp():
    """One fake for tenant calls and for the webhook's cancellations."""
    from unittest.mock import MagicMock

    fake = MagicMock()
    fake.create_subscription.return_value = {"id": "sub_new"}
    fake.create_order.return_value = {"id": "order_up"}
    app.dependency_overrides[get_razorpay] = lambda: fake
    app.dependency_overrides[get_razorpay_optional] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_razorpay, None)
    app.dependency_overrides.pop(get_razorpay_optional, None)


def in_days(days: float) -> datetime:
    return datetime.now(UTC) + timedelta(days=days)


def sync_plans(db):
    for slug in ("solo", "studio", "studio_pro"):
        plan = db.query(Plan).filter_by(slug=slug).one()
        plan.razorpay_plan_id_monthly = f"plan_{slug}"
        plan.razorpay_plan_price_inr = plan.price_monthly_inr
    db.flush()


def monthly(db, plan="studio", days=20, **kw):
    biz, user = tenant(
        db,
        plan=plan,
        billing_cycle="monthly",
        subscription_status="active",
        razorpay_subscription_id="sub_1",
        current_period_end=in_days(days),
        **kw,
    )
    sync_plans(db)
    return biz, user


def yearly(db, plan="solo", days=200, **kw):
    biz, user = tenant(
        db,
        plan=plan,
        billing_cycle="yearly",
        subscription_status="active",
        current_period_end=in_days(days),
        **kw,
    )
    sync_plans(db)
    return biz, user


def quote(api, user, slug):
    return api.get(f"{QUOTE}?plan_slug={slug}", headers=auth(user))


def change(api, user, slug):
    return api.post(CHANGE, headers=auth(user), json={"plan_slug": slug})


def reload(db, biz):
    as_owner(db)
    db.refresh(biz)
    return biz


def charged_for(biz, sub_id, slug, end, event="subscription.charged"):
    body = subscription_event(event, biz, end=end, sub_id=sub_id, slug=slug)
    return with_payment(body, amount=99900, order_id="order_x")


def upgrade_order(biz, slug, *, amount, expected, kind="upgrade", **extra):
    notes = {
        "business_id": str(biz.id),
        "plan_slug": slug,
        "cycle": "yearly",
        "kind": kind,
        "expected_paise": str(expected),
        **extra,
    }
    return {
        "event": "order.paid",
        "payload": {
            "order": {
                "entity": {"id": "order_up", "amount": amount, "notes": notes}
            },
            "payment": {"entity": payment_entity("pay_up", amount)},
        },
    }


# --- quotes ------------------------------------------------------------------


def test_monthly_upgrade_quote_charges_the_new_price_now(api, db, rzp):
    _, user = monthly(db)
    body = quote(api, user, "studio_pro").json()
    assert body["direction"] == "upgrade"
    assert body["effective"] == "now"
    assert body["amount_due_inr"] == 2499
    assert "isn't refunded" in body["summary"]


def test_monthly_downgrade_quote_is_scheduled_and_free(api, db, rzp):
    biz, user = monthly(db)
    body = quote(api, user, "solo").json()
    assert body["direction"] == "downgrade"
    assert body["effective"] == "period_end"
    assert body["amount_due_inr"] == 0
    assert datetime.fromisoformat(body["effective_on"]) == (
        biz.current_period_end
    )


def test_yearly_upgrade_quote_is_prorated(api, db, rzp):
    _, user = yearly(db, days=182.5)
    body = quote(api, user, "studio").json()
    assert body["direction"] == "upgrade"
    # (9990 - 4990) for half a year.
    assert 2499 <= body["amount_due_inr"] <= 2501


def test_yearly_downgrade_quote_waits_for_renewal(api, db, rzp):
    _, user = yearly(db, plan="studio")
    body = quote(api, user, "solo").json()
    assert body["direction"] == "downgrade"
    assert body["amount_due_inr"] == 0


def test_same_plan_is_not_a_change(api, db, rzp):
    _, user = monthly(db)
    r = quote(api, user, "studio")
    assert r.status_code == 409
    assert "already on this plan" in r.json()["detail"]


def test_a_cancelled_monthly_plan_can_be_resumed(api, db, rzp):
    biz, user = monthly(db)
    biz.subscription_status = "cancelled"
    db.flush()
    body = quote(api, user, "studio").json()
    assert body["direction"] == "resume"
    assert body["effective"] == "period_end"
    assert body["amount_due_inr"] == 0


def test_a_free_or_lapsed_business_has_nothing_to_change(api, db, rzp):
    _, free = tenant(db)
    sync_plans(db)
    assert quote(api, free, "studio").status_code == 409
    as_owner(db)
    biz, lapsed = monthly(db)
    biz.current_period_end = in_days(-1)
    db.flush()
    assert quote(api, lapsed, "solo").status_code == 409


@pytest.mark.parametrize("slug", ["free", "nonexistent"])
def test_cannot_switch_to_the_free_or_an_unknown_plan(api, db, rzp, slug):
    _, user = monthly(db)
    assert quote(api, user, slug).status_code == 404


def test_only_the_business_admin_can_change_plans(api, db, rzp):
    biz, _ = monthly(db)
    designer = make_user(db, role=UserRole.designer, business=biz)
    as_owner(db)
    assert quote(api, designer, "solo").status_code == 403
    assert change(api, designer, "solo").status_code == 403


def test_proration_rounds_up_and_never_goes_below_one_rupee(db):
    seed_plans(db)
    now = datetime.now(UTC)
    target = db.query(Plan).filter_by(slug="studio").one()
    current = get_plan(db, "solo")

    def owed(days):
        return prorated_upgrade_rupees(
            current, target, now + timedelta(days=days), now
        )

    assert owed(365) == 5000
    assert owed(1) == 14  # 5000 / 365 = 13.7, rounded up
    assert owed(0.00001) == 1
    assert owed(-3) == 1
    # More than a year left (clock skew) is capped at a year.
    assert owed(900) == 5000


# --- changing ----------------------------------------------------------------


def test_monthly_upgrade_starts_a_new_subscription_now(api, db, rzp):
    biz, user = monthly(db)
    r = change(api, user, "studio_pro")
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "checkout"
    assert body["checkout"]["kind"] == "subscription"
    assert body["checkout"]["razorpay_id"] == "sub_new"
    assert body["checkout"]["amount_inr"] == 2499
    args = rzp.create_subscription.call_args.args
    assert args[0] == "plan_studio_pro"
    assert args[1]["kind"] == "upgrade"
    assert args[3] is None  # starts right away
    reload(db, biz)
    # Nothing changes until the payment arrives.
    assert biz.plan == "studio"
    assert biz.razorpay_subscription_id == "sub_1"
    assert biz.pending_subscription_id == "sub_new"
    assert biz.pending_plan_slug == "studio_pro"


def test_monthly_downgrade_is_authorised_now_and_starts_at_period_end(
    api, db, rzp
):
    biz, user = monthly(db)
    r = change(api, user, "solo")
    assert r.status_code == 200
    assert r.json()["mode"] == "checkout"
    args = rzp.create_subscription.call_args.args
    assert args[1]["kind"] == "scheduled"
    assert args[3] == int(biz.current_period_end.timestamp())
    reload(db, biz)
    assert biz.pending_kind == "scheduled"
    assert biz.plan == "studio"


def test_a_plan_renewing_within_the_hour_cannot_be_scheduled(api, db, rzp):
    _, user = monthly(db, days=0.01)
    r = change(api, user, "solo")
    assert r.status_code == 409
    rzp.create_subscription.assert_not_called()


def test_a_new_choice_replaces_the_waiting_switch(api, db, rzp):
    biz, user = monthly(db)
    biz.pending_plan_slug = "solo"
    biz.pending_subscription_id = "sub_old_pending"
    biz.pending_kind = "scheduled"
    db.flush()
    change(api, user, "studio_pro")
    rzp.cancel_subscription.assert_called_once_with(
        "sub_old_pending", at_cycle_end=False
    )
    reload(db, biz)
    assert biz.pending_subscription_id == "sub_new"
    assert biz.pending_plan_slug == "studio_pro"


def test_yearly_upgrade_creates_a_prorated_order(api, db, rzp):
    biz, user = yearly(db, days=182.5)
    r = change(api, user, "studio")
    body = r.json()
    assert body["mode"] == "checkout"
    assert body["checkout"]["kind"] == "order"
    amount = body["checkout"]["amount_inr"]
    assert 2499 <= amount <= 2501
    paise, _, notes = rzp.create_order.call_args.args
    assert paise == amount * 100
    assert notes["kind"] == "upgrade"
    assert notes["expected_paise"] == str(amount * 100)
    assert reload(db, biz).plan == "solo"


def test_yearly_downgrade_is_remembered_without_calling_razorpay(api, db, rzp):
    biz, user = yearly(db, plan="studio")
    r = change(api, user, "solo")
    body = r.json()
    assert body["mode"] == "scheduled"
    assert body["status"]["pending_plan"] == "solo"
    assert body["status"]["pending_plan_name"] == "Solo"
    assert body["status"]["pending_change_on"] is not None
    rzp.create_subscription.assert_not_called()
    rzp.create_order.assert_not_called()
    assert reload(db, biz).pending_plan_slug == "solo"


def test_keeping_the_plan_cancels_a_scheduled_switch(api, db, rzp):
    biz, user = yearly(db, plan="studio")
    change(api, user, "solo")
    r = change(api, user, "studio")
    assert r.json()["status"]["pending_plan"] is None
    assert reload(db, biz).pending_plan_slug is None


def test_resuming_schedules_the_same_plan_after_the_period(api, db, rzp):
    biz, user = monthly(db)
    biz.subscription_status = "cancelled"
    db.flush()
    r = change(api, user, "studio")
    assert r.json()["mode"] == "checkout"
    args = rzp.create_subscription.call_args.args
    assert args[0] == "plan_studio"
    assert args[3] == int(biz.current_period_end.timestamp())


def test_a_provider_failure_leaves_nothing_half_done(api, db, rzp):
    biz, user = monthly(db)
    rzp.create_subscription.side_effect = RazorpayError("down")
    r = change(api, user, "studio_pro")
    assert r.status_code == 502
    reload(db, biz)
    assert biz.pending_subscription_id is None
    assert biz.plan == "studio"


def test_an_unsynced_target_plan_is_refused(api, db, rzp):
    biz, user = monthly(db)
    plan = db.query(Plan).filter_by(slug="studio_pro").one()
    plan.razorpay_plan_id_monthly = None
    db.flush()
    assert change(api, user, "studio_pro").status_code == 409


# --- status ------------------------------------------------------------------


def test_status_says_when_a_plan_can_be_changed(api, db, rzp):
    _, user = monthly(db)
    assert (
        api.get(STATUS, headers=auth(user)).json()["can_change_plan"] is True
    )


def test_a_free_business_cannot_change_plan(api, db, rzp):
    _, user = tenant(db)
    assert (
        api.get(STATUS, headers=auth(user)).json()["can_change_plan"] is False
    )


# --- webhook: the switch happens --------------------------------------------


def pending(biz, slug, sub_id, kind):
    biz.pending_plan_slug = slug
    biz.pending_subscription_id = sub_id
    biz.pending_kind = kind


def test_paid_monthly_upgrade_takes_over_and_ends_the_old_subscription(
    api, db, rzp
):
    biz, _ = monthly(db)
    pending(biz, "studio_pro", "sub_new", "upgrade")
    db.flush()
    end = in_days(30)
    post_event(api, charged_for(biz, "sub_new", "studio_pro", end), "e1")
    reload(db, biz)
    assert biz.plan == "studio_pro"
    assert biz.razorpay_subscription_id == "sub_new"
    assert biz.subscription_status == "active"
    assert biz.pending_plan_slug is None
    assert biz.pending_subscription_id is None
    # The old subscription is cancelled at once, so no double billing.
    rzp.cancel_subscription.assert_called_once_with(
        "sub_1", at_cycle_end=False
    )
    assert db.query(Payment).count() == 1


def test_the_old_subscription_firing_afterwards_changes_nothing(api, db, rzp):
    biz, _ = monthly(db)
    pending(biz, "studio_pro", "sub_new", "upgrade")
    db.flush()
    post_event(
        api, charged_for(biz, "sub_new", "studio_pro", in_days(30)), "e1"
    )
    old = subscription_event(
        "subscription.cancelled",
        biz,
        end=in_days(3),
        sub_id="sub_1",
        slug="studio",
    )
    post_event(api, old, "e2")
    reload(db, biz)
    assert biz.plan == "studio_pro"
    assert biz.subscription_status == "active"


def test_authorising_a_downgrade_ends_the_old_one_at_cycle_end(api, db, rzp):
    biz, _ = monthly(db)
    pending(biz, "solo", "sub_new", "scheduled")
    db.flush()
    event = subscription_event(
        "subscription.authenticated",
        biz,
        end=in_days(20),
        sub_id="sub_new",
        slug="solo",
    )
    post_event(api, event, "e1")
    rzp.cancel_subscription.assert_called_once_with("sub_1", at_cycle_end=True)
    reload(db, biz)
    # Still on the paid plan until the period ends.
    assert biz.plan == "studio"
    assert biz.subscription_status == "cancelled"
    assert biz.pending_plan_slug == "solo"


def test_downgrade_starts_charging_and_becomes_the_plan(api, db, rzp):
    biz, _ = monthly(db)
    pending(biz, "solo", "sub_new", "scheduled")
    biz.subscription_status = "cancelled"  # after the authorisation event
    db.flush()
    post_event(api, charged_for(biz, "sub_new", "solo", in_days(30)), "e1")
    reload(db, biz)
    assert biz.plan == "solo"
    assert biz.subscription_status == "active"
    assert biz.razorpay_subscription_id == "sub_new"
    # The old one already ended; nothing more to cancel.
    rzp.cancel_subscription.assert_not_called()


def test_a_missed_authorisation_event_still_never_double_bills(api, db, rzp):
    biz, _ = monthly(db)
    pending(biz, "solo", "sub_new", "scheduled")
    db.flush()  # old subscription is still live
    post_event(api, charged_for(biz, "sub_new", "solo", in_days(30)), "e1")
    rzp.cancel_subscription.assert_called_once_with(
        "sub_1", at_cycle_end=False
    )


def test_a_failed_cancellation_is_recorded_for_a_human(api, db, rzp):
    biz, _ = monthly(db)
    pending(biz, "studio_pro", "sub_new", "upgrade")
    db.flush()
    rzp.cancel_subscription.side_effect = RazorpayError("down")
    r = post_event(
        api, charged_for(biz, "sub_new", "studio_pro", in_days(30)), "e1"
    )
    assert r.status_code == 200
    reload(db, biz)
    assert biz.plan == "studio_pro"  # the customer paid, so they get it
    actions = [a.action for a in db.query(AuditLog).all()]
    assert "billing.replaced_subscription_not_cancelled" in actions


def test_the_webhook_works_without_razorpay_keys_configured(api, db, rzp):
    app.dependency_overrides[get_razorpay_optional] = lambda: None
    biz, _ = monthly(db)
    pending(biz, "studio_pro", "sub_new", "upgrade")
    db.flush()
    r = post_event(
        api, charged_for(biz, "sub_new", "studio_pro", in_days(30)), "e1"
    )
    assert r.status_code == 200
    assert reload(db, biz).plan == "studio_pro"
    actions = [a.action for a in db.query(AuditLog).all()]
    assert "billing.replaced_subscription_not_cancelled" in actions


def test_a_pending_subscription_for_a_different_plan_is_not_trusted(
    api, db, rzp
):
    biz, _ = monthly(db)
    pending(biz, "solo", "sub_new", "scheduled")
    db.flush()
    post_event(
        api, charged_for(biz, "sub_new", "studio_pro", in_days(30)), "e1"
    )
    reload(db, biz)
    assert biz.plan == "studio"
    assert biz.razorpay_subscription_id == "sub_1"


def test_an_abandoned_pending_subscription_is_cleared(api, db, rzp):
    biz, _ = monthly(db)
    pending(biz, "solo", "sub_new", "scheduled")
    db.flush()
    event = subscription_event(
        "subscription.cancelled",
        biz,
        end=in_days(20),
        sub_id="sub_new",
        slug="solo",
    )
    post_event(api, event, "e1")
    reload(db, biz)
    assert biz.pending_plan_slug is None
    assert biz.plan == "studio"
    assert biz.subscription_status == "active"


def test_an_unrelated_subscription_event_changes_nothing(api, db, rzp):
    biz, _ = monthly(db)
    pending(biz, "solo", "sub_new", "scheduled")
    db.flush()
    event = charged_for(biz, "sub_stranger", "studio_pro", in_days(30))
    post_event(api, event, "e1")
    reload(db, biz)
    assert biz.plan == "studio"
    assert biz.pending_plan_slug == "solo"


def test_verify_accepts_the_pending_subscription_too(api, db, rzp):
    import hashlib
    import hmac

    from .test_billing import KEY_SECRET

    biz, user = monthly(db)
    pending(biz, "studio_pro", "sub_new", "upgrade")
    db.flush()

    def body(sub_id):
        sig = hmac.new(
            KEY_SECRET.encode(), f"pay_1|{sub_id}".encode(), hashlib.sha256
        ).hexdigest()
        return {
            "razorpay_payment_id": "pay_1",
            "razorpay_subscription_id": sub_id,
            "razorpay_signature": sig,
        }

    ok = api.post(VERIFY, headers=auth(user), json=body("sub_new"))
    assert ok.json()["verified"] is True
    other = api.post(VERIFY, headers=auth(user), json=body("sub_stranger"))
    assert other.json()["verified"] is False


# --- webhook: yearly upgrade -------------------------------------------------


def test_paid_yearly_upgrade_switches_plan_and_keeps_the_end_date(
    api, db, rzp
):
    biz, _ = yearly(db, days=182)
    end = biz.current_period_end
    post_event(
        api, upgrade_order(biz, "studio", amount=250000, expected=250000)
    )
    reload(db, biz)
    assert biz.plan == "studio"
    assert biz.billing_cycle == "yearly"
    assert biz.current_period_end == end
    [receipt] = db.query(Payment).all()
    assert receipt.amount_paise == 250000
    assert receipt.plan_name == "Studio"


@pytest.mark.parametrize(
    "amount,expected,why",
    [
        (100, 250000, "paid less than quoted"),
        (250000, 0, "no quote"),
        (250000, -5, "negative quote"),
        (2_000_000, 2_000_000, "more than a full year of the plan"),
    ],
)
def test_a_bad_upgrade_payment_is_not_applied(
    api, db, rzp, amount, expected, why
):
    biz, _ = yearly(db, days=182)
    post_event(
        api, upgrade_order(biz, "studio", amount=amount, expected=expected)
    )
    reload(db, biz)
    assert biz.plan == "solo", why
    assert db.query(Payment).count() == 0


def test_an_upgrade_order_without_a_quote_is_not_applied(api, db, rzp):
    biz, _ = yearly(db, days=182)
    event = upgrade_order(biz, "studio", amount=999000, expected=1)
    del event["payload"]["order"]["entity"]["notes"]["expected_paise"]
    post_event(api, event)
    assert reload(db, biz).plan == "solo"


def test_an_upgrade_after_the_plan_lapsed_is_not_applied(api, db, rzp):
    biz, _ = yearly(db, days=-2)
    post_event(
        api, upgrade_order(biz, "studio", amount=250000, expected=250000)
    )
    reload(db, biz)
    assert biz.plan == "solo"


def test_an_upgrade_order_cannot_be_used_on_a_monthly_business(api, db, rzp):
    biz, _ = monthly(db, plan="solo")
    post_event(
        api, upgrade_order(biz, "studio", amount=250000, expected=250000)
    )
    assert reload(db, biz).plan == "solo"


def test_a_replayed_upgrade_event_is_applied_once(api, db, rzp):
    biz, _ = yearly(db, days=182)
    event = upgrade_order(biz, "studio", amount=250000, expected=250000)
    post_event(api, event, "same")
    post_event(api, event, "same")
    reload(db, biz)
    assert db.query(Payment).count() == 1


def test_renewing_applies_the_scheduled_downgrade(api, db, rzp):
    from .test_billing import order_paid_event

    biz, user = yearly(db, plan="studio", days=3)
    change(api, user, "solo")
    assert reload(db, biz).pending_plan_slug == "solo"
    post_event(api, order_paid_event(biz, "solo"))
    reload(db, biz)
    assert biz.plan == "solo"
    assert biz.pending_plan_slug is None
