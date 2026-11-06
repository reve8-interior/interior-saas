"""No double payments for a paid-up plan, and a receipt for every payment."""

from datetime import UTC, datetime, timedelta

from backend.models.payment import Payment
from backend.models.user import UserRole

from .conftest import as_owner, auth, make_business, make_user
from .test_billing import (  # noqa: F401  # fixtures are used by name
    _razorpay_settings,
    order_paid_event,
    post_event,
    rzp,
    subscription_event,
    sync_solo,
    tenant,
)

CHECKOUT = "/api/v1/billing/checkout"
STATUS = "/api/v1/billing/status"
RECEIPTS = "/api/v1/billing/receipts"
YEARLY = {"plan_slug": "studio", "billing_cycle": "yearly"}


def in_days(days: int) -> datetime:
    return datetime.now(UTC) + timedelta(days=days)


def paid_yearly(db, days_left: int, **kw):
    return tenant(
        db,
        plan="studio",
        billing_cycle="yearly",
        subscription_status="active",
        current_period_end=in_days(days_left),
        **kw,
    )


def payment_entity(payment_id="pay_1", amount=999000, **extra):
    return {
        "id": payment_id,
        "amount": amount,
        "currency": "INR",
        "method": "upi",
        "created_at": int(datetime.now(UTC).timestamp()),
        **extra,
    }


def with_payment(event: dict, **kw) -> dict:
    event["payload"]["payment"] = {"entity": payment_entity(**kw)}
    return event


def receipts_in_db(db) -> list[Payment]:
    as_owner(db)
    return db.query(Payment).order_by(Payment.paid_at).all()


# --- no paying twice ---------------------------------------------------------


def test_a_paid_up_yearly_plan_cannot_be_bought_again(api, db, rzp):
    _, user = paid_yearly(db, days_left=100)
    r = api.post(CHECKOUT, headers=auth(user), json=YEARLY)
    assert r.status_code == 409
    assert "already paid until" in r.json()["detail"]
    rzp.create_order.assert_not_called()


def test_another_yearly_plan_is_blocked_too_while_paid_up(api, db, rzp):
    _, user = paid_yearly(db, days_left=100)
    body = {"plan_slug": "solo", "billing_cycle": "yearly"}
    assert api.post(CHECKOUT, headers=auth(user), json=body).status_code == 409


def test_status_tells_the_page_when_renewal_opens(api, db):
    _, user = paid_yearly(db, days_left=100)
    body = api.get(STATUS, headers=auth(user)).json()
    assert body["can_buy"] is False
    opens = datetime.fromisoformat(body["renewal_opens_at"])
    assert abs((opens - in_days(93)).total_seconds()) < 60


def test_renewal_opens_in_the_last_week(api, db, rzp):
    _, user = paid_yearly(db, days_left=5)
    assert api.get(STATUS, headers=auth(user)).json()["can_buy"] is True
    r = api.post(CHECKOUT, headers=auth(user), json=YEARLY)
    assert r.status_code == 200


def test_renewal_is_blocked_just_before_the_window(api, db, rzp):
    _, user = paid_yearly(db, days_left=8)
    assert api.post(CHECKOUT, headers=auth(user), json=YEARLY).status_code == (
        409
    )


def test_an_expired_yearly_plan_can_be_bought_again(api, db, rzp):
    _, user = tenant(
        db,
        plan="studio",
        billing_cycle="yearly",
        subscription_status="active",
        current_period_end=in_days(-2),
    )
    assert (
        api.post(CHECKOUT, headers=auth(user), json=YEARLY).status_code == 200
    )


def test_a_cancelled_monthly_plan_can_switch_to_yearly(api, db, rzp):
    _, user = tenant(
        db,
        plan="solo",
        billing_cycle="monthly",
        subscription_status="cancelled",
        current_period_end=in_days(20),
    )
    assert (
        api.post(CHECKOUT, headers=auth(user), json=YEARLY).status_code == 200
    )


def test_active_monthly_has_no_renewal_date(api, db):
    _, user = tenant(
        db, plan="solo", billing_cycle="monthly", subscription_status="active"
    )
    body = api.get(STATUS, headers=auth(user)).json()
    assert body["can_buy"] is False
    assert body["renewal_opens_at"] is None


def test_a_free_business_can_buy(api, db):
    _, user = tenant(db)
    assert api.get(STATUS, headers=auth(user)).json()["can_buy"] is True


# --- receipts ----------------------------------------------------------------


def test_a_yearly_payment_creates_a_receipt(api, db):
    biz, user = tenant(db, name="Acme Interiors")
    post_event(api, with_payment(order_paid_event(biz)))
    [row] = receipts_in_db(db)
    assert row.razorpay_payment_id == "pay_1"
    assert row.razorpay_order_id == "order_1"
    assert row.amount_paise == 999000
    assert row.billing_cycle == "yearly"
    assert row.plan_name == "Studio"
    assert row.method == "upi"
    year = datetime.now(UTC).year
    assert row.receipt_number.startswith(f"RV8-{year}-")
    assert (row.period_end - row.period_start).days == 365


def test_receipts_are_listed_and_readable_by_the_business_admin(api, db):
    biz, user = tenant(db, name="Acme Interiors")
    post_event(api, with_payment(order_paid_event(biz)))
    listed = api.get(RECEIPTS, headers=auth(user)).json()
    assert len(listed) == 1
    assert listed[0]["billed_to"] == "Acme Interiors"
    assert listed[0]["issuer_name"] == "Reve8"
    one = api.get(f"{RECEIPTS}/{listed[0]['id']}", headers=auth(user))
    assert one.status_code == 200
    assert one.json()["receipt_number"] == listed[0]["receipt_number"]


def test_a_monthly_charge_creates_a_receipt_but_activation_does_not(api, db):
    biz, _ = tenant(db)
    end = in_days(30)
    biz.razorpay_subscription_id = "sub_1"
    db.flush()
    activated = with_payment(
        subscription_event("subscription.activated", biz, end=end),
        amount=49900,
    )
    post_event(api, activated, "evt_a")
    assert receipts_in_db(db) == []
    charged = with_payment(
        subscription_event("subscription.charged", biz, end=end),
        amount=49900,
        order_id="order_x",
    )
    post_event(api, charged, "evt_b")
    [row] = receipts_in_db(db)
    assert row.billing_cycle == "monthly"
    assert row.amount_paise == 49900
    assert row.razorpay_subscription_id == "sub_1"
    assert row.razorpay_order_id == "order_x"


def test_the_same_payment_never_gets_two_receipts(api, db):
    biz, _ = tenant(db)
    post_event(api, with_payment(order_paid_event(biz)), "evt_1")
    post_event(api, with_payment(order_paid_event(biz)), "evt_2")
    assert len(receipts_in_db(db)) == 1


def test_each_payment_gets_its_own_increasing_number(api, db):
    biz, _ = tenant(db)
    post_event(api, with_payment(order_paid_event(biz), payment_id="pay_1"))
    post_event(
        api, with_payment(order_paid_event(biz), payment_id="pay_2"), "evt_2"
    )
    first, second = receipts_in_db(db)
    assert first.receipt_number != second.receipt_number
    assert first.receipt_number < second.receipt_number


def test_a_payment_without_usable_details_still_grants_the_plan(api, db):
    biz, _ = tenant(db)
    for i, bad in enumerate((0, -5, True, "999000", None)):
        event = order_paid_event(biz)
        event["payload"]["payment"] = {
            "entity": {"id": f"pay_{i}", "amount": bad}
        }
        post_event(api, event, f"evt_{i}")
    assert receipts_in_db(db) == []
    db.refresh(biz)
    assert biz.plan == "studio"


def test_an_underpaid_order_gets_no_receipt_and_no_plan(api, db):
    biz, _ = tenant(db)
    event = with_payment(order_paid_event(biz), amount=100)
    event["payload"]["order"]["entity"]["amount"] = 100
    post_event(api, event)
    assert receipts_in_db(db) == []
    db.refresh(biz)
    assert biz.plan == "free"


def test_a_business_cannot_see_another_businesses_receipts(api, db):
    biz, _ = tenant(db)
    post_event(api, with_payment(order_paid_event(biz)))
    as_owner(db)
    other = make_business(db, name="Other Studio")
    other_admin = make_user(db, role=UserRole.admin, business=other)
    assert api.get(RECEIPTS, headers=auth(other_admin)).json() == []
    mine = receipts_in_db(db)[0]
    r = api.get(f"{RECEIPTS}/{mine.id}", headers=auth(other_admin))
    assert r.status_code == 404


def test_only_the_business_admin_can_read_receipts(api, db):
    biz, _ = tenant(db)
    designer = make_user(db, role=UserRole.designer, business=biz)
    assert api.get(RECEIPTS, headers=auth(designer)).status_code == 403


def test_unknown_receipt_is_a_404(api, db):
    _, user = tenant(db)
    missing = "00000000-0000-0000-0000-000000000001"
    assert api.get(
        f"{RECEIPTS}/{missing}", headers=auth(user)
    ).status_code == (404)


def test_receipt_routes_need_a_login(api, db):
    assert api.get(RECEIPTS).status_code in (401, 403)
