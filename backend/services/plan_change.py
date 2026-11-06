"""Switching plans the way subscription products usually do.

- Upgrade: the higher plan starts now. Yearly pays the price difference for
  the days left (an Order); monthly starts a new subscription today, and the
  old one is cancelled once the new one charges (see billing._take_over).
- Downgrade: scheduled for the end of the paid period. Monthly authorises the
  cheaper subscription now with its first charge on that date; yearly just
  remembers the choice for renewal.
- Resume / keep: undo a cancellation or a scheduled switch.

Razorpay cannot edit a UPI-authorised subscription, so a switch is always a
new subscription next to the old one, never an update of it.
"""

import math
import time
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.business import Business
from ..models.plan import Plan
from ..schemas.billing import (
    ChangePlanResponse,
    ChangeQuote,
    CheckoutResponse,
)
from ..schemas.plan import PlanFields
from .billing import (
    YEARLY_DAYS,
    _drop_pending_switch,
    _paid_plan,
    billing_status,
    can_change_plan,
)
from .plan_limits import canonical_slug, get_plan
from .razorpay_client import RazorpayClient, RazorpayError

# Razorpay needs a start date a little in the future.
MIN_SCHEDULE_LEAD = timedelta(hours=1)


def _price(plan: PlanFields | Plan, cycle: str) -> int:
    value = (
        plan.price_monthly_inr if cycle == "monthly" else plan.price_yearly_inr
    )
    return value or 0


def _day(value: datetime | None) -> str:
    return f"{value:%d %b %Y}" if value else "the end of the period"


def prorated_upgrade_rupees(
    current: PlanFields, target: Plan, end: datetime, now: datetime
) -> int:
    """The yearly price difference for the days left, rounded up, at least 1."""
    days_left = min(max((end - now).total_seconds() / 86400, 0), YEARLY_DAYS)
    difference = _price(target, "yearly") - _price(current, "yearly")
    return max(1, math.ceil(difference * days_left / YEARLY_DAYS))


def _assess(
    db: Session, business: Business, slug: str, now: datetime
) -> tuple[ChangeQuote, Plan]:
    if not can_change_plan(business, now):
        raise HTTPException(
            status_code=409,
            detail="There is no active paid plan to change. Choose a plan "
            "to subscribe instead.",
        )
    target = _paid_plan(db, slug)
    current_slug = canonical_slug(business.plan)
    current = get_plan(db, current_slug)
    cycle = business.billing_cycle or "monthly"
    end = business.current_period_end
    cancelled = business.subscription_status == "cancelled"
    price = _price(target, cycle)

    def quote(direction, effective, amount, summary, on=None) -> ChangeQuote:
        return ChangeQuote(
            direction=direction,
            effective=effective,
            effective_on=on,
            amount_due_inr=amount,
            current_plan_name=current.name,
            target_plan_name=target.name,
            billing_cycle=cycle,  # type: ignore[arg-type]
            summary=summary,
        )

    if target.slug == current_slug:
        if cycle == "monthly" and cancelled:
            return (
                quote(
                    "resume",
                    "period_end",
                    0,
                    f"{current.name} continues after {_day(end)}, billed "
                    f"₹{price} a month. Nothing is charged before then.",
                    end,
                ),
                target,
            )
        if business.pending_plan_slug:
            return (
                quote(
                    "keep",
                    "now",
                    0,
                    f"You stay on {current.name}. The scheduled switch to "
                    f"{get_plan(db, business.pending_plan_slug).name} "
                    "is cancelled.",
                ),
                target,
            )
        raise HTTPException(
            status_code=409, detail="You're already on this plan."
        )

    if price > _price(current, cycle):
        if cycle == "monthly":
            return (
                quote(
                    "upgrade",
                    "now",
                    price,
                    f"{target.name} starts today and is billed ₹{price} "
                    f"now, then every month. Your {current.name} "
                    "subscription ends today; the unused part of this "
                    "month isn't refunded.",
                ),
                target,
            )
        amount = prorated_upgrade_rupees(
            current,
            target,
            end or now,
            now,  # type: ignore[arg-type]
        )
        return (
            quote(
                "upgrade",
                "now",
                amount,
                f"{target.name} starts today. You pay ₹{amount}, the price "
                f"difference for the days left. Your plan still renews on "
                f"{_day(end)}.",
            ),
            target,
        )
    return (
        quote(
            "downgrade",
            "period_end",
            0,
            f"You keep {current.name} until {_day(end)}. {target.name} "
            f"starts then at ₹{price} "
            f"{'a month' if cycle == 'monthly' else 'a year'}.",
            end,
        ),
        target,
    )


def quote_change(db: Session, business: Business, slug: str) -> ChangeQuote:
    return _assess(db, business, slug, datetime.now(UTC))[0]


def _subscription_checkout(
    target: Plan, subscription_id: str
) -> CheckoutResponse:
    return CheckoutResponse(
        kind="subscription",
        razorpay_id=subscription_id,
        key_id=settings.razorpay_key_id,
        plan_name=target.name,
        billing_cycle="monthly",
        amount_inr=target.price_monthly_inr or 0,
    )


def _new_subscription(
    db: Session,
    business: Business,
    target: Plan,
    kind: str,
    rzp: RazorpayClient,
    start_at: int | None,
) -> CheckoutResponse:
    if not target.razorpay_plan_id_monthly:
        raise HTTPException(
            status_code=409,
            detail="This plan isn't ready for online payment yet.",
        )
    # Only one switch can wait at a time; a newer choice replaces it.
    _drop_pending_switch(business, rzp)
    created = rzp.create_subscription(
        target.razorpay_plan_id_monthly,
        {
            "business_id": str(business.id),
            "plan_slug": target.slug,
            "cycle": "monthly",
            "kind": kind,
        },
        None,
        start_at,
    )
    business.pending_plan_slug = target.slug
    business.pending_subscription_id = created["id"]
    business.pending_kind = kind
    db.commit()
    return _subscription_checkout(target, created["id"])


def change_plan(
    db: Session, business: Business, slug: str, rzp: RazorpayClient
) -> ChangePlanResponse:
    now = datetime.now(UTC)
    quote, target = _assess(db, business, slug, now)
    cycle = quote.billing_cycle
    end = business.current_period_end
    try:
        if quote.direction == "keep":
            _drop_pending_switch(business, rzp)
            db.commit()
            return _done(db, business, quote.summary)
        if quote.direction == "upgrade" and cycle == "monthly":
            checkout = _new_subscription(
                db, business, target, "upgrade", rzp, None
            )
            return _checkout(db, business, checkout, quote.summary)
        if quote.direction == "upgrade":
            current = get_plan(db, business.plan)
            amount = prorated_upgrade_rupees(
                current,
                target,
                end or now,
                now,  # type: ignore[arg-type]
            )
            order = rzp.create_order(
                amount * 100,
                f"{business.id.hex[:12]}-{int(time.time())}",
                {
                    "business_id": str(business.id),
                    "plan_slug": target.slug,
                    "cycle": "yearly",
                    "kind": "upgrade",
                    "expected_paise": str(amount * 100),
                },
            )
            checkout = CheckoutResponse(
                kind="order",
                razorpay_id=order["id"],
                key_id=settings.razorpay_key_id,
                plan_name=target.name,
                billing_cycle="yearly",
                amount_inr=amount,
            )
            return _checkout(db, business, checkout, quote.summary)
        if cycle == "yearly":
            _drop_pending_switch(business, rzp)
            business.pending_plan_slug = target.slug
            business.pending_kind = "scheduled"
            db.commit()
            return _done(db, business, quote.summary)
        if end is None or end - now < MIN_SCHEDULE_LEAD:
            raise HTTPException(
                status_code=409,
                detail="Your plan renews in under an hour. Try again after "
                "the renewal.",
            )
        checkout = _new_subscription(
            db, business, target, "scheduled", rzp, int(end.timestamp())
        )
        return _checkout(db, business, checkout, quote.summary)
    except RazorpayError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _checkout(
    db: Session, business: Business, checkout: CheckoutResponse, message: str
) -> ChangePlanResponse:
    return ChangePlanResponse(
        mode="checkout",
        checkout=checkout,
        message=message,
        status=billing_status(business, db),
    )


def _done(db: Session, business: Business, message: str) -> ChangePlanResponse:
    return ChangePlanResponse(
        mode="scheduled",
        message=message,
        status=billing_status(business, db),
    )
