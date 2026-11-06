"""Billing: tenant checkout and status, the Razorpay webhook, plan sync."""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.logging import logger
from ..models.plan import Plan
from ..models.user import User
from ..schemas.billing import (
    BillingStatus,
    ChangePlanRequest,
    ChangePlanResponse,
    ChangeQuote,
    CheckoutRequest,
    CheckoutResponse,
    PlanSyncResult,
    ReceiptRead,
    VerifyRequest,
    VerifyResponse,
)
from ..services import billing, plan_change
from ..services.razorpay_client import (
    RazorpayClient,
    get_razorpay,
    get_razorpay_optional,
)
from .deps import require_billing_admin, require_superadmin

# Razorpay events are a few KB; anything bigger is not from Razorpay.
MAX_WEBHOOK_BYTES = 256 * 1024

router = APIRouter()
webhook_router = APIRouter()
admin_router = APIRouter()


@router.get("/status", response_model=BillingStatus)
def get_status(
    db: Session = Depends(get_db),
    user: User = Depends(require_billing_admin),
):
    assert user.business is not None
    return billing.billing_status(user.business, db)


@router.post("/checkout", response_model=CheckoutResponse)
def checkout(
    body: CheckoutRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_billing_admin),
    rzp: RazorpayClient = Depends(get_razorpay),
):
    assert user.business is not None
    return billing.start_checkout(db, user.business, body, rzp)


@router.post("/verify", response_model=VerifyResponse)
def verify(
    body: VerifyRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_billing_admin),
    rzp: RazorpayClient | None = Depends(get_razorpay_optional),
):
    """Confirms the browser's payment result and applies it from Razorpay.

    The webhook stays the long-term source of truth; this makes the plan
    follow the payment straight away, even when a webhook is late or cannot
    reach the server (local development, a deploy in progress).
    """
    assert user.business is not None
    verified = billing.verify_checkout(user.business, body)
    if verified and rzp is not None:
        billing.reconcile_checkout(db, user.business, body, rzp)
    return VerifyResponse(verified=verified)


@router.get("/change-plan/quote", response_model=ChangeQuote)
def quote_plan_change(
    plan_slug: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_billing_admin),
):
    assert user.business is not None
    return plan_change.quote_change(db, user.business, plan_slug)


@router.post("/change-plan", response_model=ChangePlanResponse)
def change_plan(
    body: ChangePlanRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_billing_admin),
    rzp: RazorpayClient = Depends(get_razorpay),
):
    assert user.business is not None
    return plan_change.change_plan(db, user.business, body.plan_slug, rzp)


@router.get("/receipts", response_model=list[ReceiptRead])
def list_receipts(
    db: Session = Depends(get_db),
    user: User = Depends(require_billing_admin),
):
    assert user.business is not None
    return billing.list_receipts(db, user.business)


@router.get("/receipts/{payment_id}", response_model=ReceiptRead)
def get_receipt(
    payment_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_billing_admin),
):
    assert user.business is not None
    return billing.get_receipt(db, user.business, payment_id)


@router.post("/cancel", response_model=BillingStatus)
def cancel(
    db: Session = Depends(get_db),
    user: User = Depends(require_billing_admin),
    rzp: RazorpayClient = Depends(get_razorpay),
):
    assert user.business is not None
    billing.cancel_subscription(db, user.business, rzp, actor=user)
    return billing.billing_status(user.business, db)


@webhook_router.post("/razorpay", status_code=200)
async def razorpay_webhook(
    request: Request,
    db: Session = Depends(get_db),
    rzp: RazorpayClient | None = Depends(get_razorpay_optional),
):
    """Razorpay events. Unsigned or tampered requests are rejected."""
    raw = await request.body()
    if len(raw) > MAX_WEBHOOK_BYTES:
        raise HTTPException(status_code=413, detail="Payload too large")
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not billing.verify_webhook_signature(raw, signature):
        logger.warning("razorpay_webhook_bad_signature")
        raise HTTPException(status_code=400, detail="Invalid signature")
    event_id = request.headers.get("X-Razorpay-Event-Id", "")
    if not event_id:
        raise HTTPException(status_code=400, detail="Missing event id")
    try:
        payload = json.loads(raw)
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid payload"
        ) from None
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")
    processed = billing.apply_event(db, event_id, payload, rzp)
    return {"status": "processed" if processed else "duplicate"}


@admin_router.post("/{plan_id}/sync-razorpay", response_model=PlanSyncResult)
def sync_plan(
    plan_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
    rzp: RazorpayClient = Depends(get_razorpay),
):
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return billing.sync_plan_to_razorpay(db, plan, rzp)
