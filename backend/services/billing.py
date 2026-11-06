"""Razorpay billing: checkout, signature checks and webhook handling.

Webhooks are the source of truth for a business's plan and paid-until date;
a successful checkout alone never upgrades anyone.

Monthly plans are Razorpay Subscriptions (they renew themselves). Yearly
plans are one-time Orders (UPI Autopay caps a single debit), so renewal is
manual and extends from the current paid-until date.
"""

import hashlib
import hmac
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.logging import logger
from ..models.business import Business
from ..models.payment import Payment, receipt_seq
from ..models.payment_event import PaymentEvent
from ..models.plan import Plan
from ..models.user import User
from ..schemas.billing import (
    BillingStatus,
    CheckoutRequest,
    CheckoutResponse,
    PlanSyncResult,
    ReceiptRead,
    VerifyRequest,
)
from . import audit
from .plan_limits import canonical_slug, get_plan, seed_plans
from .razorpay_client import RazorpayClient, RazorpayError

YEARLY_DAYS = 365
# A paid-up yearly plan can be renewed this close to its end, so access
# doesn't lapse; earlier than that the days would only pile up.
RENEWAL_WINDOW_DAYS = 7
_LIVE_STATUSES = ("active", "pending")

# Subscription webhook -> the status it leaves the business in.
_SUBSCRIPTION_STATUS = {
    "subscription.activated": "active",
    "subscription.charged": "active",
    "subscription.resumed": "active",
    "subscription.pending": "pending",
    "subscription.halted": "halted",
    "subscription.cancelled": "cancelled",
    "subscription.completed": "completed",
}

# Seen on a subscription but they change nothing about access by themselves.
_SUBSCRIPTION_NEUTRAL = ("subscription.authenticated",)


# ── signatures ────────────────────────────────────────────────────────────


def _hmac_hex(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    """Razorpay signs the exact request body with the webhook secret."""
    secret = settings.razorpay_webhook_secret
    if not secret or not signature:
        return False
    return hmac.compare_digest(_hmac_hex(secret, raw_body), signature)


def verify_checkout_signature(body: VerifyRequest) -> bool:
    """Checks the signature Razorpay Checkout hands back to the browser."""
    secret = settings.razorpay_key_secret
    if not secret:
        return False
    if body.razorpay_subscription_id:
        message = f"{body.razorpay_payment_id}|{body.razorpay_subscription_id}"
    else:
        message = f"{body.razorpay_order_id}|{body.razorpay_payment_id}"
    return hmac.compare_digest(
        _hmac_hex(secret, message.encode()), body.razorpay_signature
    )


# ── tenant actions ────────────────────────────────────────────────────────


def _paid_plan(db: Session, slug: str) -> Plan:
    seed_plans(db)
    plan = db.scalar(select(Plan).where(Plan.slug == canonical_slug(slug)))
    if plan is None or plan.price_monthly_inr is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


def _first_month_offer_applies(business: Business) -> bool:
    """Only a business that never subscribed gets the first-cycle discount."""
    return bool(
        settings.razorpay_first_month_offer_id
        and business.razorpay_subscription_id is None
        and business.billing_cycle is None
    )


def _purchase_block(
    business: Business, now: datetime
) -> tuple[str, datetime | None] | None:
    """Why a new payment would be wasted, with when renewal opens, or None.

    A plan that is already paid for must not be paid for again: the days
    would just pile up. A yearly plan can be renewed shortly before it ends.
    """
    live = business.subscription_status in _LIVE_STATUSES
    if business.billing_cycle == "monthly" and live:
        return (
            "You already have an active monthly subscription. "
            "Cancel it before choosing another plan.",
            None,
        )
    end = business.current_period_end
    if business.billing_cycle == "yearly" and live and end:
        opens = end - timedelta(days=RENEWAL_WINDOW_DAYS)
        if now < opens:
            return (
                f"Your yearly plan is already paid until {end:%d %b %Y}. "
                f"You can renew from {opens:%d %b %Y}.",
                opens,
            )
    return None


def can_change_plan(business: Business, now: datetime) -> bool:
    """A paid, unexpired plan that can be switched to another one."""
    end = business.current_period_end
    if not end or end <= now or not business.billing_cycle:
        return False
    status = business.subscription_status
    if business.billing_cycle == "monthly":
        return status in (*_LIVE_STATUSES, "cancelled")
    return status == "active"


def billing_status(business: Business, db: Session) -> BillingStatus:
    now = datetime.now(UTC)
    block = _purchase_block(business, now)
    pending = business.pending_plan_slug
    return BillingStatus(
        can_change_plan=can_change_plan(business, now),
        pending_plan=pending,
        pending_plan_name=get_plan(db, pending).name if pending else None,
        pending_change_on=(
            business.current_period_end
            if pending and business.pending_kind == "scheduled"
            else None
        ),
        can_buy=block is None,
        renewal_opens_at=block[1] if block else None,
        plan=canonical_slug(business.plan),
        plan_name=get_plan(db, business.plan).name,
        billing_cycle=business.billing_cycle,  # type: ignore[arg-type]
        subscription_status=business.subscription_status,
        # A plan an admin granted has no payments; show its access end instead.
        current_period_end=business.current_period_end
        or business.access_expires_at,
        payments_enabled=settings.razorpay_enabled,
        first_month_offer_available=_first_month_offer_applies(business),
        can_cancel=(
            business.billing_cycle == "monthly"
            and business.subscription_status in _LIVE_STATUSES
            and business.razorpay_subscription_id is not None
        ),
    )


def start_checkout(
    db: Session,
    business: Business,
    body: CheckoutRequest,
    rzp: RazorpayClient,
) -> CheckoutResponse:
    plan = _paid_plan(db, body.plan_slug)
    block = _purchase_block(business, datetime.now(UTC))
    if block:
        raise HTTPException(status_code=409, detail=block[0])
    notes = {
        "business_id": str(business.id),
        "plan_slug": plan.slug,
        "cycle": body.billing_cycle,
    }
    try:
        if body.billing_cycle == "monthly":
            return _monthly_checkout(db, business, plan, notes, rzp)
        return _yearly_checkout(business, plan, notes, rzp)
    except RazorpayError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _monthly_checkout(
    db: Session,
    business: Business,
    plan: Plan,
    notes: dict[str, str],
    rzp: RazorpayClient,
) -> CheckoutResponse:
    if not plan.razorpay_plan_id_monthly or plan.price_monthly_inr is None:
        raise HTTPException(
            status_code=409,
            detail="This plan isn't ready for online payment yet.",
        )
    offer = _first_month_offer_applies(business)
    subscription = rzp.create_subscription(
        plan.razorpay_plan_id_monthly,
        notes,
        settings.razorpay_first_month_offer_id if offer else None,
    )
    business.razorpay_subscription_id = subscription["id"]
    business.billing_cycle = "monthly"
    business.subscription_status = "created"
    db.commit()
    return CheckoutResponse(
        kind="subscription",
        razorpay_id=subscription["id"],
        key_id=settings.razorpay_key_id,
        plan_name=plan.name,
        billing_cycle="monthly",
        amount_inr=plan.price_monthly_inr,
        first_month_offer=offer,
    )


def _yearly_checkout(
    business: Business,
    plan: Plan,
    notes: dict[str, str],
    rzp: RazorpayClient,
) -> CheckoutResponse:
    if plan.price_yearly_inr is None:
        raise HTTPException(
            status_code=409, detail="This plan has no yearly price."
        )
    order = rzp.create_order(
        plan.price_yearly_inr * 100,
        f"{business.id.hex[:12]}-{int(time.time())}",
        notes,
    )
    return CheckoutResponse(
        kind="order",
        razorpay_id=order["id"],
        key_id=settings.razorpay_key_id,
        plan_name=plan.name,
        billing_cycle="yearly",
        amount_inr=plan.price_yearly_inr,
    )


def verify_checkout(business: Business, body: VerifyRequest) -> bool:
    """True when Checkout's signature is genuine and the id is ours.

    This only confirms the browser result; the webhook grants access.
    """
    if body.razorpay_subscription_id and body.razorpay_subscription_id not in (
        business.razorpay_subscription_id,
        business.pending_subscription_id,
    ):
        return False
    return verify_checkout_signature(body)


def _drop_pending_switch(business: Business, rzp: RazorpayClient) -> None:
    """Forget a waiting plan switch and stop its subscription, if any."""
    waiting = business.pending_subscription_id
    _clear_pending(business)
    if not waiting:
        return
    try:
        rzp.cancel_subscription(waiting, at_cycle_end=False)
    except RazorpayError as exc:
        # It never charged yet; Razorpay lets an unauthorised one expire.
        logger.warning(
            "razorpay_pending_cancel_failed",
            business_id=str(business.id),
            error=str(exc),
        )


def cancel_subscription(
    db: Session,
    business: Business,
    rzp: RazorpayClient,
    actor: User | None = None,
) -> None:
    """Stop renewing; access continues until the paid-until date."""
    if not billing_status(business, db).can_cancel:
        raise HTTPException(
            status_code=409, detail="There is no active subscription."
        )
    try:
        rzp.cancel_subscription(business.razorpay_subscription_id or "")
    except RazorpayError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    business.subscription_status = "cancelled"
    _drop_pending_switch(business, rzp)
    audit.record(
        db,
        actor=actor,
        business_id=business.id,
        action="billing.cancel_requested",
        entity_type="business",
        entity_id=business.id,
        payload={"plan": business.plan, "cycle": business.billing_cycle},
    )
    db.commit()


# ── confirm a checkout without waiting for the webhook ───────────────────


def _checkout_event(
    body: VerifyRequest, rzp: RazorpayClient
) -> dict[str, Any] | None:
    """The webhook-shaped event for a verified checkout, from Razorpay's API."""
    payment = rzp.fetch_payment(body.razorpay_payment_id)
    if body.razorpay_subscription_id:
        sub = rzp.fetch_subscription(body.razorpay_subscription_id)
        status = sub.get("status")
        if status == "active":
            event = "subscription.charged"
        elif status == "authenticated":
            event = "subscription.authenticated"
        else:
            return None
        entities: dict[str, Any] = {"subscription": {"entity": sub}}
        if status == "active" and payment.get("status") == "captured":
            entities["payment"] = {"entity": payment}
        return {"event": event, "payload": entities}
    order = rzp.fetch_order(body.razorpay_order_id or "")
    if order.get("status") != "paid" or payment.get("status") != "captured":
        return None
    if payment.get("order_id") != order.get("id"):
        return None
    return {
        "event": "order.paid",
        "payload": {
            "order": {"entity": order},
            "payment": {"entity": payment},
        },
    }


def reconcile_checkout(
    db: Session,
    business: Business,
    body: VerifyRequest,
    rzp: RazorpayClient,
) -> None:
    """Apply a verified checkout now. Never fails the request.

    The state comes from Razorpay's own API (not the browser) and goes
    through the same code as a webhook, so the result is identical and the
    webhook arriving later changes nothing.
    """
    try:
        event = _checkout_event(body, rzp)
        kind = "subscription" if body.razorpay_subscription_id else "order"
        notes = _dict(_entity(event or {}, kind).get("notes"))
        if event and notes.get("business_id") != str(business.id):
            # Never let one business's confirmation touch another's account.
            logger.warning(
                "razorpay_reconcile_wrong_business",
                business_id=str(business.id),
            )
            return
        if event:
            apply_event(db, f"sync:{body.razorpay_payment_id}", event, rzp)
    except RazorpayError as exc:
        logger.warning("razorpay_reconcile_failed", error=str(exc))


# ── receipts ──────────────────────────────────────────────────────────────


def _receipt(payment: Payment, business: Business) -> ReceiptRead:
    return ReceiptRead(
        id=payment.id,  # type: ignore[arg-type]
        receipt_number=payment.receipt_number,
        razorpay_payment_id=payment.razorpay_payment_id,
        paid_at=payment.paid_at,
        plan_name=payment.plan_name,
        billing_cycle=payment.billing_cycle,  # type: ignore[arg-type]
        amount_paise=payment.amount_paise,
        currency=payment.currency,
        method=payment.method,
        period_start=payment.period_start,
        period_end=payment.period_end,
        billed_to=business.name,
        issuer_name=settings.receipt_issuer_name,
        issuer_address=settings.receipt_issuer_address,
    )


def list_receipts(db: Session, business: Business) -> list[ReceiptRead]:
    rows = db.scalars(
        select(Payment)
        .where(Payment.business_id == business.id)
        .order_by(Payment.paid_at.desc())
    ).all()
    return [_receipt(row, business) for row in rows]


def get_receipt(
    db: Session, business: Business, payment_id: uuid.UUID
) -> ReceiptRead:
    row = db.scalar(
        select(Payment).where(
            Payment.id == payment_id, Payment.business_id == business.id
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return _receipt(row, business)


# ── admin ─────────────────────────────────────────────────────────────────


def sync_plan_to_razorpay(
    db: Session, plan: Plan, rzp: RazorpayClient
) -> PlanSyncResult:
    """Create the monthly Razorpay plan when missing or the price changed."""
    if plan.price_monthly_inr is None:
        raise HTTPException(
            status_code=422, detail="A free plan has nothing to sync."
        )
    if (
        plan.razorpay_plan_id_monthly
        and plan.razorpay_plan_price_inr == plan.price_monthly_inr
    ):
        return PlanSyncResult(
            razorpay_plan_id_monthly=plan.razorpay_plan_id_monthly,
            created=False,
        )
    try:
        created = rzp.create_plan(plan.name, plan.price_monthly_inr * 100)
    except RazorpayError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    plan.razorpay_plan_id_monthly = created["id"]
    plan.razorpay_plan_price_inr = plan.price_monthly_inr
    db.commit()
    return PlanSyncResult(
        razorpay_plan_id_monthly=plan.razorpay_plan_id_monthly, created=True
    )


# ── webhook ───────────────────────────────────────────────────────────────

Outcome = Literal["applied", "stale", "ignored"]


def _dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _entity(payload: dict[str, Any], kind: str) -> dict[str, Any]:
    """The provider entity of one kind; tolerant of malformed payloads."""
    return _dict(_dict(_dict(payload.get("payload")).get(kind)).get("entity"))


def _from_unix(value: object) -> datetime | None:
    return (
        datetime.fromtimestamp(int(value), UTC)
        if isinstance(value, int | float) and not isinstance(value, bool)
        else None
    )


def _business_for(db: Session, notes: dict[str, Any]) -> Business | None:
    """The business named in the notes, row-locked so events serialise."""
    try:
        business_id = uuid.UUID(str(notes.get("business_id")))
    except ValueError:
        return None
    return db.get(Business, business_id, with_for_update=True)


def _apply_period(business: Business, end: datetime) -> None:
    business.current_period_end = end
    business.access_expires_at = end


def _known_paid_plan(db: Session, slug: object) -> Plan | None:
    """The paid plan for a notes slug, or None; never trusts free text."""
    if not slug:
        return None
    seed_plans(db)
    plan = db.scalar(
        select(Plan).where(Plan.slug == canonical_slug(str(slug)))
    )
    return plan if plan and plan.price_monthly_inr is not None else None


def _next_receipt_number(db: Session, paid_at: datetime) -> str:
    seq = db.scalar(receipt_seq.next_value())
    return f"RV8-{paid_at:%Y}-{seq:06d}"


def _record_payment(
    db: Session,
    business: Business,
    plan: Plan,
    cycle: str,
    payment: dict[str, Any],
    *,
    order_id: object = None,
    subscription_id: str | None = None,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
) -> None:
    """Store the receipt for a captured payment, once per payment id."""
    payment_id = payment.get("id")
    amount = payment.get("amount")
    if (
        not isinstance(payment_id, str)
        or not payment_id
        or not isinstance(amount, int)
        or isinstance(amount, bool)
        or amount <= 0
    ):
        logger.warning(
            "razorpay_payment_unusable", business_id=str(business.id)
        )
        return
    if db.scalar(
        select(Payment.id).where(Payment.razorpay_payment_id == payment_id)
    ):
        return
    paid_at = _from_unix(payment.get("created_at")) or datetime.now(UTC)
    method = payment.get("method")
    db.add(
        Payment(
            business_id=business.id,
            razorpay_payment_id=payment_id[:64],
            razorpay_order_id=(
                order_id[:64] if isinstance(order_id, str) else None
            ),
            razorpay_subscription_id=(
                subscription_id[:64] if subscription_id else None
            ),
            receipt_number=_next_receipt_number(db, paid_at),
            plan_slug=plan.slug,
            plan_name=plan.name,
            billing_cycle=cycle,
            amount_paise=amount,
            currency=str(payment.get("currency") or "INR")[:3],
            method=method[:32] if isinstance(method, str) else None,
            paid_at=paid_at,
            period_start=period_start,
            period_end=period_end,
        )
    )
    db.flush()


# Provider cancellations to make once the database change is committed:
# (subscription id, at_cycle_end).
Cancellations = list[tuple[str, bool]]


def _clear_pending(business: Business) -> None:
    business.pending_plan_slug = None
    business.pending_subscription_id = None
    business.pending_kind = None


def _take_over(
    db: Session,
    business: Business,
    event_type: str,
    entity: dict[str, Any],
    payment: dict[str, Any] | None,
    cancellations: Cancellations,
) -> Outcome:
    """The pending subscription starts charging: it becomes the plan."""
    plan = _known_paid_plan(db, _dict(entity.get("notes")).get("plan_slug"))
    if plan is None or plan.slug != business.pending_plan_slug:
        logger.error(
            "razorpay_pending_plan_mismatch",
            business_id=str(business.id),
            event_type=event_type,
        )
        return "ignored"
    old_id = business.razorpay_subscription_id
    old_is_live = business.subscription_status in _LIVE_STATUSES
    if old_id and (business.pending_kind == "upgrade" or old_is_live):
        # Never leave two subscriptions charging the same customer.
        cancellations.append((old_id, False))
    business.razorpay_subscription_id = str(entity.get("id"))
    business.plan = plan.slug
    business.billing_cycle = "monthly"
    business.subscription_status = "active"
    end = _from_unix(entity.get("current_end"))
    if end:
        _apply_period(business, end)
    _clear_pending(business)
    if event_type == "subscription.charged" and payment:
        _record_payment(
            db,
            business,
            plan,
            "monthly",
            payment,
            order_id=payment.get("order_id"),
            subscription_id=str(entity.get("id")),
            period_start=_from_unix(entity.get("current_start")),
            period_end=end,
        )
    return "applied"


def _handle_pending_subscription(
    db: Session,
    business: Business,
    event_type: str,
    entity: dict[str, Any],
    payment: dict[str, Any] | None,
    cancellations: Cancellations,
) -> Outcome:
    if event_type == "subscription.authenticated":
        # The customer authorised the switch: end the old one at its cycle
        # end so the two never overlap.
        old_id = business.razorpay_subscription_id
        if (
            business.pending_kind == "scheduled"
            and old_id
            and business.subscription_status in _LIVE_STATUSES
        ):
            cancellations.append((old_id, True))
            business.subscription_status = "cancelled"
        return "applied"
    if _SUBSCRIPTION_STATUS.get(event_type) == "active":
        return _take_over(
            db, business, event_type, entity, payment, cancellations
        )
    if event_type in (
        "subscription.halted",
        "subscription.cancelled",
        "subscription.completed",
    ):
        _clear_pending(business)
        return "applied"
    return "ignored"


def _handle_subscription(
    db: Session,
    business: Business,
    event_type: str,
    entity: dict[str, Any],
    payment: dict[str, Any] | None = None,
    cancellations: Cancellations | None = None,
) -> Outcome:
    sub_id = entity.get("id")
    if sub_id and sub_id == business.pending_subscription_id:
        return _handle_pending_subscription(
            db,
            business,
            event_type,
            entity,
            payment,
            cancellations if cancellations is not None else [],
        )
    # A stale event for a subscription the business replaced is ignored.
    if sub_id != business.razorpay_subscription_id:
        return "ignored"
    if event_type not in _SUBSCRIPTION_STATUS:
        return "ignored"
    status = _SUBSCRIPTION_STATUS[event_type]
    end = _from_unix(entity.get("current_end"))
    if status == "active":
        notes = _dict(entity.get("notes"))
        plan = _known_paid_plan(db, notes.get("plan_slug"))
        if plan is None:
            logger.error(
                "razorpay_unknown_plan",
                business_id=str(business.id),
                event_type=event_type,
            )
            return "ignored"
        business.plan = plan.slug
        business.billing_cycle = "monthly"
        if end:
            _apply_period(business, end)
        if event_type == "subscription.charged" and payment:
            _record_payment(
                db,
                business,
                plan,
                "monthly",
                payment,
                order_id=payment.get("order_id"),
                subscription_id=str(entity.get("id")),
                period_start=_from_unix(entity.get("current_start")),
                period_end=end,
            )
    elif status in ("cancelled", "completed") and end:
        # Already paid for: keep access until the cycle ends.
        _apply_period(business, end)
    business.subscription_status = status
    return "applied"


def _upgrade_order_paid(
    db: Session,
    business: Business,
    entity: dict[str, Any],
    payment: dict[str, Any] | None,
) -> Outcome:
    """A paid prorated upgrade: the higher plan now, same end date."""
    notes = _dict(entity.get("notes"))
    plan = _known_paid_plan(db, notes.get("plan_slug"))
    paid = entity.get("amount_paid", entity.get("amount"))
    try:
        expected = int(str(notes.get("expected_paise")))
    except ValueError:
        expected = 0
    now = datetime.now(UTC)
    end = business.current_period_end
    if (
        plan is None
        or plan.price_yearly_inr is None
        or not isinstance(paid, int)
        # Paid what the server quoted, and never more than a full year.
        or expected <= 0
        or paid < expected
        or expected > plan.price_yearly_inr * 100
        or business.billing_cycle != "yearly"
        or end is None
        or end <= now
    ):
        logger.error(
            "razorpay_upgrade_rejected",
            business_id=str(business.id),
            order_id=entity.get("id"),
            amount_paid=paid,
        )
        return "ignored"
    business.plan = plan.slug
    business.subscription_status = "active"
    _clear_pending(business)
    if payment:
        _record_payment(
            db,
            business,
            plan,
            "yearly",
            payment,
            order_id=str(entity.get("id")),
            period_start=now,
            period_end=end,
        )
    return "applied"


def _already_applied(db: Session, payment: dict[str, Any] | None) -> bool:
    """True when this payment already extended the plan (its receipt exists).

    A payment can reach us twice: the webhook and the checkout confirmation.
    Without this a yearly payment would be added to the end date twice.
    """
    payment_id = _dict(payment).get("id")
    return isinstance(payment_id, str) and bool(
        db.scalar(
            select(Payment.id).where(Payment.razorpay_payment_id == payment_id)
        )
    )


def _handle_order_paid(
    db: Session,
    business: Business,
    entity: dict[str, Any],
    payment: dict[str, Any] | None = None,
) -> Outcome:
    notes = _dict(entity.get("notes"))
    if notes.get("cycle") != "yearly":
        return "ignored"
    if _already_applied(db, payment):
        return "ignored"
    if notes.get("kind") == "upgrade":
        return _upgrade_order_paid(db, business, entity, payment)
    plan = _known_paid_plan(db, notes.get("plan_slug"))
    paid = entity.get("amount_paid", entity.get("amount"))
    # Never grant a plan for less than its yearly price.
    if (
        plan is None
        or plan.price_yearly_inr is None
        or not isinstance(paid, int)
        or paid < plan.price_yearly_inr * 100
    ):
        logger.error(
            "razorpay_order_rejected",
            business_id=str(business.id),
            order_id=entity.get("id"),
            amount_paid=paid,
        )
        return "ignored"
    now = datetime.now(UTC)
    base = max(now, business.current_period_end or now)
    business.plan = plan.slug
    business.billing_cycle = "yearly"
    business.subscription_status = "active"
    _clear_pending(business)
    _apply_period(business, base + timedelta(days=YEARLY_DAYS))
    if payment:
        _record_payment(
            db,
            business,
            plan,
            "yearly",
            payment,
            order_id=str(entity.get("id")),
            period_start=base,
            period_end=business.current_period_end,
        )
    return "applied"


def _route(
    db: Session, event_type: str, payload: dict[str, Any]
) -> tuple[Business | None, dict[str, Any]]:
    """The business and provider entity an event is about."""
    if event_type in _SUBSCRIPTION_STATUS or event_type in (
        _SUBSCRIPTION_NEUTRAL
    ):
        kind = "subscription"
    elif event_type == "order.paid":
        kind = "order"
    elif event_type == "payment.failed":
        kind = "payment"
    else:
        return None, {}
    entity = _entity(payload, kind)
    return _business_for(db, _dict(entity.get("notes"))), entity


def _is_stale(business: Business, event_at: datetime | None) -> bool:
    last = business.last_billing_event_at
    return bool(event_at and last and event_at < last)


def apply_event(
    db: Session,
    event_id: str,
    payload: dict[str, Any],
    rzp: RazorpayClient | None = None,
) -> bool:
    """Apply one webhook. False when it was a replay (already processed).

    Safe against concurrent redelivery (the event id is claimed first under a
    unique constraint), out-of-order delivery (events older than the newest
    applied one are recorded but not applied) and underpayment.
    """
    if db.scalar(
        select(PaymentEvent.id).where(
            PaymentEvent.razorpay_event_id == event_id
        )
    ):
        return False

    event_type = str(payload.get("event", ""))
    record = PaymentEvent(
        razorpay_event_id=event_id,
        event_type=event_type[:64],
        payload={},
        processed_at=datetime.now(UTC),
    )
    try:
        with db.begin_nested():
            db.add(record)
            db.flush()
    except IntegrityError:
        # A concurrent delivery of the same event won the race.
        return False

    cancellations: Cancellations = []
    event_at = _from_unix(payload.get("created_at"))
    business, entity = _route(db, event_type, payload)
    outcome: Outcome = "ignored"
    if business is not None:
        record.business_id = business.id
        if _is_stale(business, event_at):
            outcome = "stale"
        elif event_type in _SUBSCRIPTION_STATUS or event_type in (
            _SUBSCRIPTION_NEUTRAL
        ):
            outcome = _handle_subscription(
                db,
                business,
                event_type,
                entity,
                _entity(payload, "payment"),
                cancellations,
            )
        elif event_type == "order.paid":
            outcome = _handle_order_paid(
                db, business, entity, _entity(payload, "payment")
            )
        if outcome == "applied" and event_at:
            business.last_billing_event_at = event_at
    record.payload = _safe_summary(payload, outcome)

    if business is not None:
        audit.record(
            db,
            actor=None,
            business_id=business.id,
            action=f"billing.{event_type}",
            entity_type="business",
            entity_id=business.id,
            payload={
                "plan": business.plan,
                "status": business.subscription_status,
                "outcome": outcome,
            },
        )
    db.commit()
    logger.info(
        "razorpay_event_applied",
        event_type=event_type,
        outcome=outcome,
        business_id=str(business.id) if business else None,
    )
    if business is not None and cancellations:
        _end_replaced_subscriptions(db, business, cancellations, rzp)
    return True


def _end_replaced_subscriptions(
    db: Session,
    business: Business,
    cancellations: Cancellations,
    rzp: RazorpayClient | None,
) -> None:
    """Stop the subscriptions a switch replaced; a failure is recorded loudly.

    The customer may be billed twice until someone cancels by hand, so the
    failure is written to the audit log as well as the error log.
    """
    for sub_id, at_cycle_end in cancellations:
        try:
            if rzp is None:
                raise RazorpayError("payments are not configured")
            rzp.cancel_subscription(sub_id, at_cycle_end=at_cycle_end)
        except RazorpayError as exc:
            logger.error(
                "razorpay_replaced_subscription_not_cancelled",
                business_id=str(business.id),
                subscription_id=sub_id,
                error=str(exc),
            )
            audit.record(
                db,
                actor=None,
                business_id=business.id,
                action="billing.replaced_subscription_not_cancelled",
                entity_type="business",
                entity_id=business.id,
                payload={"subscription_id": sub_id},
            )
            db.commit()


def _safe_summary(payload: dict[str, Any], outcome: Outcome) -> dict[str, Any]:
    """Ids, status and amounts only; never the whole provider payload."""
    summary: dict[str, Any] = {
        "event": payload.get("event"),
        "outcome": outcome,
    }
    for kind in ("subscription", "order", "payment"):
        entity = _entity(payload, kind)
        if entity:
            summary[kind] = {
                key: entity.get(key)
                for key in (
                    "id",
                    "status",
                    "amount",
                    "amount_paid",
                    "plan_id",
                    "order_id",
                )
                if entity.get(key) is not None
            }
    return summary
