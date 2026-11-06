"""A verified checkout moves the plan at once, without waiting for a webhook."""

import hashlib
import hmac
from datetime import UTC, datetime, timedelta

from backend.models.payment import Payment
from backend.models.user import UserRole
from backend.services.razorpay_client import RazorpayError

from .conftest import as_owner, auth, make_business, make_user
from .test_billing import (  # noqa: F401  # fixtures are used by name
    KEY_SECRET,
    _razorpay_settings,
    order_paid_event,
    post_event,
    subscription_event,
    tenant,
)
from .test_billing_receipts import with_payment
from .test_plan_change import rzp  # noqa: F401

VERIFY = "/api/v1/billing/verify"


def ts(days: float) -> int:
    return int((datetime.now(UTC) + timedelta(days=days)).timestamp())


def signed(message: str) -> str:
    return hmac.new(
        KEY_SECRET.encode(), message.encode(), hashlib.sha256
    ).hexdigest()


def sub_body(sub_id="sub_1", pay_id="pay_1"):
    return {
        "razorpay_payment_id": pay_id,
        "razorpay_subscription_id": sub_id,
        "razorpay_signature": signed(f"{pay_id}|{sub_id}"),
    }


def order_body(order_id="order_1", pay_id="pay_1"):
    return {
        "razorpay_payment_id": pay_id,
        "razorpay_order_id": order_id,
        "razorpay_signature": signed(f"{order_id}|{pay_id}"),
    }


def provider_subscription(biz, status="active", slug="solo", sub_id="sub_1"):
    return {
        "id": sub_id,
        "status": status,
        "current_start": ts(0),
        "current_end": ts(30),
        "notes": {
            "business_id": str(biz.id),
            "plan_slug": slug,
            "cycle": "monthly",
        },
    }


def provider_payment(pay_id="pay_1", amount=49900, **extra):
    return {
        "id": pay_id,
        "status": "captured",
        "amount": amount,
        "currency": "INR",
        "method": "upi",
        "created_at": ts(0),
        **extra,
    }


def provider_order(biz, slug="studio", status="paid", amount=999000):
    return {
        "id": "order_1",
        "status": status,
        "amount": amount,
        "amount_paid": amount if status == "paid" else 0,
        "notes": {
            "business_id": str(biz.id),
            "plan_slug": slug,
            "cycle": "yearly",
        },
    }


def after_monthly_checkout(db):
    """What checkout leaves behind before any payment is confirmed."""
    return tenant(
        db,
        billing_cycle="monthly",
        subscription_status="created",
        razorpay_subscription_id="sub_1",
    )


def reload(db, biz):
    as_owner(db)
    db.refresh(biz)
    return biz


def verify(api, user, body):
    return api.post(VERIFY, headers=auth(user), json=body)


# --- monthly -----------------------------------------------------------------


def test_a_paid_monthly_subscription_is_applied_without_a_webhook(
    api, db, rzp
):
    biz, user = after_monthly_checkout(db)
    rzp.fetch_subscription.return_value = provider_subscription(biz)
    rzp.fetch_payment.return_value = provider_payment()
    r = verify(api, user, sub_body())
    assert r.json() == {"verified": True}
    reload(db, biz)
    assert biz.plan == "solo"
    assert biz.subscription_status == "active"
    assert biz.current_period_end is not None
    [receipt] = db.query(Payment).all()
    assert receipt.amount_paise == 49900
    assert receipt.billing_cycle == "monthly"


def test_the_webhook_arriving_later_changes_nothing(api, db, rzp):
    biz, user = after_monthly_checkout(db)
    rzp.fetch_subscription.return_value = provider_subscription(biz)
    rzp.fetch_payment.return_value = provider_payment()
    verify(api, user, sub_body())
    charged = subscription_event(
        "subscription.charged", biz, end=datetime.now(UTC) + timedelta(days=30)
    )
    post_event(api, with_payment(charged, amount=49900), "evt_late")
    reload(db, biz)
    assert biz.plan == "solo"
    assert db.query(Payment).count() == 1


def test_confirming_twice_gives_one_receipt(api, db, rzp):
    biz, user = after_monthly_checkout(db)
    rzp.fetch_subscription.return_value = provider_subscription(biz)
    rzp.fetch_payment.return_value = provider_payment()
    verify(api, user, sub_body())
    verify(api, user, sub_body())
    assert len(db.query(Payment).all()) == 1


def test_an_unpaid_subscription_is_left_alone(api, db, rzp):
    biz, user = after_monthly_checkout(db)
    for status in ("created", "pending", "halted", "cancelled"):
        rzp.fetch_subscription.return_value = provider_subscription(
            biz, status=status
        )
        rzp.fetch_payment.return_value = provider_payment()
        r = verify(api, user, sub_body())
        assert r.json() == {"verified": True}
    reload(db, biz)
    assert biz.plan == "free"
    assert db.query(Payment).count() == 0


def test_an_authenticated_subscription_does_not_grant_a_plan(api, db, rzp):
    biz, user = after_monthly_checkout(db)
    rzp.fetch_subscription.return_value = provider_subscription(
        biz, status="authenticated"
    )
    rzp.fetch_payment.return_value = provider_payment()
    verify(api, user, sub_body())
    assert reload(db, biz).plan == "free"


# --- yearly ------------------------------------------------------------------


def test_a_paid_yearly_order_is_applied_without_a_webhook(api, db, rzp):
    biz, user = tenant(db)
    rzp.fetch_order.return_value = provider_order(biz)
    rzp.fetch_payment.return_value = provider_payment(
        amount=999000, order_id="order_1"
    )
    assert verify(api, user, order_body()).json() == {"verified": True}
    reload(db, biz)
    assert biz.plan == "studio"
    assert biz.billing_cycle == "yearly"
    assert (biz.current_period_end - datetime.now(UTC)).days in (364, 365)
    assert db.query(Payment).count() == 1


def test_a_payment_is_never_added_to_the_end_date_twice(api, db, rzp):
    biz, user = tenant(db)
    rzp.fetch_order.return_value = provider_order(biz)
    rzp.fetch_payment.return_value = provider_payment(
        amount=999000, order_id="order_1"
    )
    verify(api, user, order_body())
    first_end = reload(db, biz).current_period_end
    # The webhook for the very same payment arrives afterwards.
    post_event(
        api,
        with_payment(order_paid_event(biz), amount=999000),
        "evt_late",
    )
    assert reload(db, biz).current_period_end == first_end
    # ...and confirming again does not extend it either.
    verify(api, user, order_body())
    assert reload(db, biz).current_period_end == first_end


def test_the_webhook_first_then_the_confirmation_is_also_applied_once(
    api, db, rzp
):
    biz, user = tenant(db)
    post_event(
        api, with_payment(order_paid_event(biz), amount=999000), "evt_first"
    )
    first_end = reload(db, biz).current_period_end
    rzp.fetch_order.return_value = provider_order(biz)
    rzp.fetch_payment.return_value = provider_payment(
        amount=999000, order_id="order_1"
    )
    verify(api, user, order_body())
    assert reload(db, biz).current_period_end == first_end


def test_an_unpaid_or_uncaptured_order_grants_nothing(api, db, rzp):
    biz, user = tenant(db)
    rzp.fetch_order.return_value = provider_order(biz, status="created")
    rzp.fetch_payment.return_value = provider_payment(
        amount=999000, order_id="order_1"
    )
    verify(api, user, order_body())
    rzp.fetch_order.return_value = provider_order(biz)
    rzp.fetch_payment.return_value = provider_payment(
        amount=999000, order_id="order_1", status="authorized"
    )
    verify(api, user, order_body())
    assert reload(db, biz).plan == "free"


def test_a_payment_for_a_different_order_grants_nothing(api, db, rzp):
    biz, user = tenant(db)
    rzp.fetch_order.return_value = provider_order(biz)
    rzp.fetch_payment.return_value = provider_payment(
        amount=999000, order_id="order_other"
    )
    verify(api, user, order_body())
    assert reload(db, biz).plan == "free"


def test_an_underpaid_order_still_grants_nothing(api, db, rzp):
    biz, user = tenant(db)
    rzp.fetch_order.return_value = provider_order(biz, amount=100)
    rzp.fetch_payment.return_value = provider_payment(
        amount=100, order_id="order_1"
    )
    verify(api, user, order_body())
    assert reload(db, biz).plan == "free"


# --- safety ------------------------------------------------------------------


def test_another_businesses_order_is_not_applied_here(api, db, rzp):
    biz, user = tenant(db)
    as_owner(db)
    other = make_business(db, name="Other Studio")
    as_owner(db)
    rzp.fetch_order.return_value = provider_order(other)
    rzp.fetch_payment.return_value = provider_payment(
        amount=999000, order_id="order_1"
    )
    verify(api, user, order_body())
    reload(db, biz)
    reload(db, other)
    assert biz.plan == "free"
    assert other.plan == "free"


def test_a_bad_signature_never_reaches_razorpay(api, db, rzp):
    _, user = tenant(db)
    body = order_body()
    body["razorpay_signature"] = "0" * 64
    assert verify(api, user, body).json() == {"verified": False}
    rzp.fetch_order.assert_not_called()
    rzp.fetch_payment.assert_not_called()


def test_a_razorpay_outage_does_not_fail_the_confirmation(api, db, rzp):
    biz, user = after_monthly_checkout(db)
    rzp.fetch_payment.side_effect = RazorpayError("down")
    r = verify(api, user, sub_body())
    assert r.status_code == 200
    assert r.json() == {"verified": True}
    # The webhook is still the fallback.
    assert reload(db, biz).plan == "free"


def test_only_the_business_admin_can_confirm(api, db, rzp):
    biz, _ = after_monthly_checkout(db)
    designer = make_user(db, role=UserRole.designer, business=biz)
    as_owner(db)
    assert verify(api, designer, sub_body()).status_code == 403
