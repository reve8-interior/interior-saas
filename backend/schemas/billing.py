import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

BillingCycle = Literal["monthly", "yearly"]


class CheckoutRequest(BaseModel):
    plan_slug: str = Field(pattern=r"^[a-z][a-z0-9_]{1,31}$")
    billing_cycle: BillingCycle


class CheckoutResponse(BaseModel):
    """What Razorpay Checkout needs to open for this purchase."""

    kind: Literal["subscription", "order"]
    razorpay_id: str
    key_id: str
    plan_name: str
    billing_cycle: BillingCycle
    amount_inr: int
    # The first-cycle discount applies; shown as a note, not a price.
    first_month_offer: bool = False


class VerifyRequest(BaseModel):
    razorpay_payment_id: str = Field(min_length=1, max_length=64)
    razorpay_signature: str = Field(min_length=1, max_length=128)
    razorpay_subscription_id: str | None = Field(default=None, max_length=64)
    razorpay_order_id: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def _exactly_one_reference(self) -> "VerifyRequest":
        if bool(self.razorpay_subscription_id) == bool(self.razorpay_order_id):
            raise ValueError(
                "Provide either razorpay_subscription_id or razorpay_order_id"
            )
        return self


class VerifyResponse(BaseModel):
    verified: bool


class BillingStatus(BaseModel):
    plan: str
    plan_name: str
    billing_cycle: BillingCycle | None
    subscription_status: str
    current_period_end: datetime | None
    payments_enabled: bool
    # A new monthly subscription would get the first-cycle discount.
    first_month_offer_available: bool
    can_cancel: bool
    # False while a payment would only stack days on a plan already paid for.
    can_buy: bool
    # When can_buy is False because a yearly plan is paid up: the first day
    # renewal opens. None when blocked for another reason.
    renewal_opens_at: datetime | None = None
    # A paid plan can be switched to another one (not free, not lapsed).
    can_change_plan: bool = False
    # A switch waiting for the period to end, and when it happens.
    pending_plan: str | None = None
    pending_plan_name: str | None = None
    pending_change_on: datetime | None = None


class ReceiptRead(BaseModel):
    """A payment receipt. Proof of payment, not a GST tax invoice."""

    id: uuid.UUID
    receipt_number: str
    razorpay_payment_id: str
    paid_at: datetime
    plan_name: str
    billing_cycle: BillingCycle
    amount_paise: int
    currency: str
    method: str | None
    period_start: datetime | None
    period_end: datetime | None
    billed_to: str
    issuer_name: str
    issuer_address: str


class PlanSyncResult(BaseModel):
    razorpay_plan_id_monthly: str | None
    created: bool


class ChangeQuote(BaseModel):
    """What switching to another plan would do, shown before confirming."""

    direction: Literal["upgrade", "downgrade", "resume", "keep"]
    # "now" needs a payment (amount_due_inr); "period_end" is scheduled.
    effective: Literal["now", "period_end"]
    effective_on: datetime | None
    amount_due_inr: int
    current_plan_name: str
    target_plan_name: str
    billing_cycle: BillingCycle
    summary: str


class ChangePlanRequest(BaseModel):
    plan_slug: str = Field(pattern=r"^[a-z][a-z0-9_]{1,31}$")


class ChangePlanResponse(BaseModel):
    # "checkout": open Razorpay for `checkout`; "scheduled": nothing to pay.
    mode: Literal["checkout", "scheduled"]
    checkout: CheckoutResponse | None = None
    message: str
    status: BillingStatus
