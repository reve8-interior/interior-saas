"""Razorpay billing: signatures, checkout, webhook handling, plan sync."""

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest

from backend.core.config import settings
from backend.main import app
from backend.models.payment_event import PaymentEvent
from backend.models.plan import Plan
from backend.models.user import UserRole
from backend.schemas.billing import VerifyRequest
from backend.services import billing
from backend.services.plan_limits import seed_plans
from backend.services.razorpay_client import RazorpayError, get_razorpay

from .conftest import (
    as_business,
    as_owner,
    auth,
    make_business,
    make_user,
)

WEBHOOK = "/api/v1/webhooks/razorpay"
KEY_SECRET = "key-secret"
WEBHOOK_SECRET = "webhook-secret"


@pytest.fixture(autouse=True)
def _razorpay_settings(monkeypatch):
    monkeypatch.setattr(settings, "razorpay_key_id", "rzp_test_x")
    monkeypatch.setattr(settings, "razorpay_key_secret", KEY_SECRET)
    monkeypatch.setattr(settings, "razorpay_webhook_secret", WEBHOOK_SECRET)
    monkeypatch.setattr(settings, "razorpay_first_month_offer_id", "")


@pytest.fixture
def rzp():
    fake = MagicMock()
    fake.create_subscription.return_value = {"id": "sub_1"}
    fake.create_order.return_value = {"id": "order_1"}
    fake.create_plan.return_value = {"id": "plan_1"}
    app.dependency_overrides[get_razorpay] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_razorpay, None)


def sign(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def tenant(db, **kw):
    seed_plans(db)
    biz = make_business(db, **kw)
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    return biz, user


def sync_solo(db):
    plan = db.query(Plan).filter_by(slug="solo").one()
    plan.razorpay_plan_id_monthly = "plan_solo"
    plan.razorpay_plan_price_inr = plan.price_monthly_inr
    db.flush()


def post_event(
    api, event: dict, event_id: str = "evt_1", secret=WEBHOOK_SECRET
):
    raw = json.dumps(event).encode()
    return api.post(
        WEBHOOK,
        content=raw,
        headers={
            "X-Razorpay-Signature": sign(secret, raw),
            "X-Razorpay-Event-Id": event_id,
            "Content-Type": "application/json",
        },
    )


def subscription_event(event, biz, *, end, sub_id="sub_1", slug="solo"):
    return {
        "event": event,
        "payload": {
            "subscription": {
                "entity": {
                    "id": sub_id,
                    "status": "active",
                    "current_end": int(end.timestamp()),
                    "notes": {
                        "business_id": str(biz.id),
                        "plan_slug": slug,
                        "cycle": "monthly",
                    },
                }
            }
        },
    }


def order_paid_event(biz, slug="studio"):
    return {
        "event": "order.paid",
        "payload": {
            "order": {
                "entity": {
                    "id": "order_1",
                    "amount": 999000,
                    "notes": {
                        "business_id": str(biz.id),
                        "plan_slug": slug,
                        "cycle": "yearly",
                    },
                }
            }
        },
    }


# --- signatures --------------------------------------------------------------


def test_webhook_signature_valid_tampered_and_missing():
    raw = b'{"event": "x"}'
    good = sign(WEBHOOK_SECRET, raw)
    assert billing.verify_webhook_signature(raw, good)
    assert not billing.verify_webhook_signature(raw + b" ", good)
    assert not billing.verify_webhook_signature(raw, "")
    assert not billing.verify_webhook_signature(raw, sign("other", raw))


def test_webhook_rejected_when_no_secret_is_configured(monkeypatch):
    monkeypatch.setattr(settings, "razorpay_webhook_secret", "")
    assert not billing.verify_webhook_signature(b"{}", sign("", b"{}"))


def test_checkout_signature_for_subscription_and_order():
    sub = VerifyRequest(
        razorpay_payment_id="pay_1",
        razorpay_subscription_id="sub_1",
        razorpay_signature=sign(KEY_SECRET, b"pay_1|sub_1"),
    )
    order = VerifyRequest(
        razorpay_payment_id="pay_1",
        razorpay_order_id="order_1",
        razorpay_signature=sign(KEY_SECRET, b"order_1|pay_1"),
    )
    assert billing.verify_checkout_signature(sub)
    assert billing.verify_checkout_signature(order)
    bad = sub.model_copy(update={"razorpay_signature": "0" * 64})
    assert not billing.verify_checkout_signature(bad)


def test_verify_request_needs_exactly_one_reference():
    with pytest.raises(ValueError):
        VerifyRequest(razorpay_payment_id="p", razorpay_signature="s")
    with pytest.raises(ValueError):
        VerifyRequest(
            razorpay_payment_id="p",
            razorpay_signature="s",
            razorpay_subscription_id="a",
            razorpay_order_id="b",
        )


# --- webhook -----------------------------------------------------------------


def test_webhook_rejects_bad_signature(api, db):
    biz, _ = tenant(db)
    event = subscription_event(
        "subscription.activated", biz, end=datetime.now(UTC)
    )
    r = post_event(api, event, secret="wrong")
    assert r.status_code == 400
    as_owner(db)
    assert db.query(PaymentEvent).count() == 0


def test_webhook_requires_an_event_id(api, db):
    raw = b"{}"
    r = api.post(
        WEBHOOK,
        content=raw,
        headers={"X-Razorpay-Signature": sign(WEBHOOK_SECRET, raw)},
    )
    assert r.status_code == 400


def test_activation_sets_plan_status_and_paid_until(api, db):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    end = datetime.now(UTC) + timedelta(days=30)
    r = post_event(
        api, subscription_event("subscription.activated", biz, end=end)
    )
    assert r.status_code == 200
    as_owner(db)
    db.refresh(biz)
    assert biz.plan == "solo"
    assert biz.subscription_status == "active"
    assert biz.billing_cycle == "monthly"
    assert int(biz.current_period_end.timestamp()) == int(end.timestamp())
    assert biz.access_expires_at == biz.current_period_end


def test_replayed_event_is_ignored(api, db):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    first_end = datetime.now(UTC) + timedelta(days=30)
    post_event(
        api, subscription_event("subscription.charged", biz, end=first_end)
    )
    later = first_end + timedelta(days=30)
    r = post_event(
        api, subscription_event("subscription.charged", biz, end=later)
    )
    assert r.json() == {"status": "duplicate"}
    as_owner(db)
    db.refresh(biz)
    assert int(biz.current_period_end.timestamp()) == int(
        first_end.timestamp()
    )
    assert db.query(PaymentEvent).count() == 1


def test_event_for_a_replaced_subscription_changes_nothing(api, db):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_new"
    end = datetime.now(UTC) + timedelta(days=30)
    post_event(
        api,
        subscription_event(
            "subscription.activated", biz, end=end, sub_id="sub_old"
        ),
    )
    as_owner(db)
    db.refresh(biz)
    assert biz.plan == "free"
    assert biz.subscription_status == "none"


def test_cancellation_keeps_access_until_the_cycle_ends(api, db):
    biz, _ = tenant(db, plan="solo", subscription_status="active")
    biz.razorpay_subscription_id = "sub_1"
    end = datetime.now(UTC) + timedelta(days=12)
    post_event(api, subscription_event("subscription.cancelled", biz, end=end))
    as_owner(db)
    db.refresh(biz)
    assert biz.subscription_status == "cancelled"
    assert biz.plan == "solo"
    assert int(biz.access_expires_at.timestamp()) == int(end.timestamp())


def test_halted_payment_marks_status_without_touching_access(api, db):
    biz, _ = tenant(db, plan="solo", subscription_status="active")
    biz.razorpay_subscription_id = "sub_1"
    biz.access_expires_at = datetime.now(UTC) + timedelta(days=3)
    expiry = biz.access_expires_at
    post_event(
        api,
        subscription_event("subscription.halted", biz, end=datetime.now(UTC)),
    )
    as_owner(db)
    db.refresh(biz)
    assert biz.subscription_status == "halted"
    assert biz.access_expires_at == expiry


def test_yearly_order_extends_from_now_when_nothing_is_paid(api, db):
    biz, _ = tenant(db)
    post_event(api, order_paid_event(biz))
    as_owner(db)
    db.refresh(biz)
    assert biz.plan == "studio"
    assert biz.billing_cycle == "yearly"
    assert biz.subscription_status == "active"
    days = (biz.current_period_end - datetime.now(UTC)).days
    assert days in (364, 365)


def test_yearly_renewal_extends_from_the_current_end(api, db):
    biz, _ = tenant(db, plan="studio", billing_cycle="yearly")
    current = datetime.now(UTC) + timedelta(days=100)
    biz.current_period_end = current
    db.flush()
    post_event(api, order_paid_event(biz))
    as_owner(db)
    db.refresh(biz)
    assert biz.current_period_end == current + timedelta(days=365)


def test_unknown_business_and_unknown_events_are_acknowledged(api, db):
    r = post_event(
        api,
        {
            "event": "subscription.activated",
            "payload": {
                "subscription": {
                    "entity": {"id": "sub_x", "notes": {"business_id": "nope"}}
                }
            },
        },
    )
    assert r.status_code == 200
    r = post_event(api, {"event": "refund.created"}, event_id="evt_2")
    assert r.status_code == 200


def test_stored_event_has_no_raw_payload(api, db):
    biz, _ = tenant(db)
    biz.razorpay_subscription_id = "sub_1"
    event = subscription_event(
        "subscription.activated", biz, end=datetime.now(UTC)
    )
    event["payload"]["subscription"]["entity"]["customer_email"] = "a@b.com"
    post_event(api, event)
    as_owner(db)
    stored = db.query(PaymentEvent).one()
    assert "a@b.com" not in json.dumps(stored.payload)


# --- checkout ----------------------------------------------------------------


def test_monthly_checkout_creates_a_subscription(api, db, rzp):
    biz, user = tenant(db)
    sync_solo(db)
    r = api.post(
        "/api/v1/billing/checkout",
        headers=auth(user),
        json={"plan_slug": "solo", "billing_cycle": "monthly"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["kind"] == "subscription"
    assert body["razorpay_id"] == "sub_1"
    assert body["amount_inr"] == 499
    assert "secret" not in json.dumps(body).lower()
    rzp.create_subscription.assert_called_once()
    args = rzp.create_subscription.call_args.args
    assert args[0] == "plan_solo"
    assert args[1]["business_id"] == str(biz.id)
    db.refresh(biz)
    assert biz.razorpay_subscription_id == "sub_1"
    assert biz.subscription_status == "created"
    # Checkout alone never upgrades the plan.
    assert biz.plan == "free"


def test_first_month_offer_only_for_a_first_subscription(
    api, db, rzp, monkeypatch
):
    monkeypatch.setattr(settings, "razorpay_first_month_offer_id", "offer_1")
    _, user = tenant(db)
    sync_solo(db)
    payload = {"plan_slug": "solo", "billing_cycle": "monthly"}
    first = api.post(
        "/api/v1/billing/checkout", headers=auth(user), json=payload
    )
    assert first.json()["first_month_offer"] is True
    assert rzp.create_subscription.call_args.args[2] == "offer_1"
    second = api.post(
        "/api/v1/billing/checkout", headers=auth(user), json=payload
    )
    assert second.json()["first_month_offer"] is False
    assert rzp.create_subscription.call_args.args[2] is None


def test_monthly_checkout_needs_a_synced_plan(api, db, rzp):
    _, user = tenant(db)
    r = api.post(
        "/api/v1/billing/checkout",
        headers=auth(user),
        json={"plan_slug": "solo", "billing_cycle": "monthly"},
    )
    assert r.status_code == 409
    rzp.create_subscription.assert_not_called()


def test_yearly_checkout_prices_the_order_on_the_server(api, db, rzp):
    _, user = tenant(db)
    r = api.post(
        "/api/v1/billing/checkout",
        headers=auth(user),
        json={"plan_slug": "studio", "billing_cycle": "yearly"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["kind"] == "order"
    assert r.json()["amount_inr"] == 9990
    assert rzp.create_order.call_args.args[0] == 9990 * 100


def test_cannot_check_out_the_free_plan_or_an_unknown_one(api, db, rzp):
    _, user = tenant(db)
    for slug in ("free", "ghost"):
        r = api.post(
            "/api/v1/billing/checkout",
            headers=auth(user),
            json={"plan_slug": slug, "billing_cycle": "yearly"},
        )
        assert r.status_code == 404


def test_active_monthly_subscription_blocks_a_second_checkout(api, db, rzp):
    _, user = tenant(
        db, plan="solo", billing_cycle="monthly", subscription_status="active"
    )
    sync_solo(db)
    r = api.post(
        "/api/v1/billing/checkout",
        headers=auth(user),
        json={"plan_slug": "studio", "billing_cycle": "yearly"},
    )
    assert r.status_code == 409


def test_provider_failure_becomes_a_friendly_502(api, db, rzp):
    _, user = tenant(db)
    rzp.create_order.side_effect = RazorpayError("The provider is down.")
    r = api.post(
        "/api/v1/billing/checkout",
        headers=auth(user),
        json={"plan_slug": "studio", "billing_cycle": "yearly"},
    )
    assert r.status_code == 502
    assert r.json()["detail"] == "The provider is down."


def test_checkout_is_off_without_razorpay_keys(api, db, monkeypatch):
    monkeypatch.setattr(settings, "razorpay_key_id", "")
    _, user = tenant(db)
    r = api.post(
        "/api/v1/billing/checkout",
        headers=auth(user),
        json={"plan_slug": "studio", "billing_cycle": "yearly"},
    )
    assert r.status_code == 503


def test_only_the_business_admin_can_pay(api, db, rzp):
    biz, _ = tenant(db)
    designer = make_user(db, role=UserRole.designer, business=biz)
    body = {"plan_slug": "studio", "billing_cycle": "yearly"}
    as_owner(db)
    r = api.post("/api/v1/billing/checkout", headers=auth(designer), json=body)
    assert r.status_code == 403


def test_an_expired_business_can_still_pay(api, db, rzp):
    _, user = tenant(
        db,
        plan="solo",
        access_expires_at=datetime.now(UTC) - timedelta(days=1),
    )
    # A lapsed plan drops to Free but the portal stays usable...
    assert api.get("/api/v1/clients", headers=auth(user)).status_code == 200
    # ...and billing stays open so they can renew.
    r = api.post(
        "/api/v1/billing/checkout",
        headers=auth(user),
        json={"plan_slug": "studio", "billing_cycle": "yearly"},
    )
    assert r.status_code == 200


# --- verify, status, cancel --------------------------------------------------


def test_verify_accepts_a_genuine_signature_only_for_our_subscription(api, db):
    _, user = tenant(db)
    user.business.razorpay_subscription_id = "sub_1"
    good = {
        "razorpay_payment_id": "pay_1",
        "razorpay_subscription_id": "sub_1",
        "razorpay_signature": sign(KEY_SECRET, b"pay_1|sub_1"),
    }
    r = api.post("/api/v1/billing/verify", headers=auth(user), json=good)
    assert r.json() == {"verified": True}
    forged = {**good, "razorpay_signature": "0" * 64}
    r = api.post("/api/v1/billing/verify", headers=auth(user), json=forged)
    assert r.json() == {"verified": False}
    foreign = {
        "razorpay_payment_id": "pay_1",
        "razorpay_subscription_id": "sub_other",
        "razorpay_signature": sign(KEY_SECRET, b"pay_1|sub_other"),
    }
    r = api.post("/api/v1/billing/verify", headers=auth(user), json=foreign)
    assert r.json() == {"verified": False}


def test_status_reports_plan_and_cancel_ability(api, db):
    biz, user = tenant(
        db,
        plan="solo",
        billing_cycle="monthly",
        subscription_status="active",
        razorpay_subscription_id="sub_1",
    )
    body = api.get("/api/v1/billing/status", headers=auth(user)).json()
    assert body["plan"] == "solo"
    assert body["plan_name"] == "Solo"
    assert body["can_cancel"] is True
    assert body["payments_enabled"] is True


def test_cancel_stops_renewal_but_keeps_the_plan(api, db, rzp):
    biz, user = tenant(
        db,
        plan="solo",
        billing_cycle="monthly",
        subscription_status="active",
        razorpay_subscription_id="sub_1",
    )
    r = api.post("/api/v1/billing/cancel", headers=auth(user))
    assert r.status_code == 200
    rzp.cancel_subscription.assert_called_once_with("sub_1")
    db.refresh(biz)
    assert biz.subscription_status == "cancelled"
    assert biz.plan == "solo"


def test_cannot_cancel_without_an_active_subscription(api, db, rzp):
    _, user = tenant(db)
    r = api.post("/api/v1/billing/cancel", headers=auth(user))
    assert r.status_code == 409
    rzp.cancel_subscription.assert_not_called()


# --- admin plan sync ---------------------------------------------------------


def test_sync_creates_the_monthly_plan_once_per_price(api, db, rzp):
    admin = make_user(db, role=UserRole.superadmin)
    seed_plans(db)
    solo = db.query(Plan).filter_by(slug="solo").one()
    url = f"/api/v1/admin/plans/{solo.id}/sync-razorpay"

    first = api.post(url, headers=auth(admin))
    assert first.json() == {
        "razorpay_plan_id_monthly": "plan_1",
        "created": True,
    }
    assert rzp.create_plan.call_args.args == ("Solo", 499 * 100)

    again = api.post(url, headers=auth(admin))
    assert again.json()["created"] is False
    assert rzp.create_plan.call_count == 1

    solo.price_monthly_inr = 599
    db.flush()
    rzp.create_plan.return_value = {"id": "plan_2"}
    changed = api.post(url, headers=auth(admin))
    assert changed.json() == {
        "razorpay_plan_id_monthly": "plan_2",
        "created": True,
    }


def test_sync_rejects_the_free_plan_and_non_superadmins(api, db, rzp):
    admin = make_user(db, role=UserRole.superadmin)
    seed_plans(db)
    free = db.query(Plan).filter_by(slug="free").one()
    r = api.post(
        f"/api/v1/admin/plans/{free.id}/sync-razorpay", headers=auth(admin)
    )
    assert r.status_code == 422

    _, tenant_admin = tenant(db)
    solo = db.query(Plan).filter_by(slug="solo").one()
    r = api.post(
        f"/api/v1/admin/plans/{solo.id}/sync-razorpay",
        headers=auth(tenant_admin),
    )
    assert r.status_code == 403


def test_the_landing_page_pricing_switch_does_not_hide_portal_plans(api, db):
    from backend.services.landing_settings import set_show_pricing

    biz, user = tenant(db)
    as_owner(db)
    set_show_pricing(db, False)
    db.flush()
    assert api.get("/api/v1/plans").json() == []
    r = api.get("/api/v1/billing/plans", headers=auth(user))
    assert r.status_code == 200
    assert {"solo", "studio"} <= {p["slug"] for p in r.json()}


def test_portal_plans_need_a_billing_admin(api, db):
    assert api.get("/api/v1/billing/plans").status_code == 401
