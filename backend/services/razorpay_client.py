"""Thin Razorpay REST client. The only module that talks to Razorpay.

Errors are logged in full but raised as a generic `RazorpayError`, so raw
provider text never reaches a user.
"""

from typing import Any

import httpx
from fastapi import HTTPException

from ..core.config import settings
from ..core.logging import logger

BASE_URL = "https://api.razorpay.com/v1"
_TIMEOUT_SECONDS = 15
_RETRIES = 2
# Razorpay subscriptions need a cycle count; ten years of months.
MONTHLY_TOTAL_COUNT = 120


class RazorpayError(Exception):
    """A Razorpay call failed; the message is safe to show to a user."""


class RazorpayClient:
    def __init__(
        self,
        key_id: str,
        key_secret: str,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._auth = (key_id, key_secret)
        self._transport = transport

    def _request(
        self, method: str, path: str, body: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        last: Exception | None = None
        for _ in range(_RETRIES + 1):
            try:
                with httpx.Client(
                    auth=self._auth,
                    timeout=_TIMEOUT_SECONDS,
                    transport=self._transport,
                ) as client:
                    response = client.request(
                        method, f"{BASE_URL}{path}", json=body
                    )
            except httpx.TransportError as exc:
                last = exc
                continue
            if response.status_code >= 500:
                last = RuntimeError(f"HTTP {response.status_code}")
                continue
            if response.status_code >= 400:
                logger.warning(
                    "razorpay_request_rejected",
                    path=path,
                    status=response.status_code,
                    body=response.text[:300],
                )
                raise RazorpayError(
                    "The payment provider rejected the request."
                )
            return response.json()
        logger.error("razorpay_unreachable", path=path, error=str(last))
        raise RazorpayError(
            "The payment provider is unavailable. Please try again shortly."
        )

    def create_plan(self, name: str, amount_paise: int) -> dict[str, Any]:
        return self._request(
            "POST",
            "/plans",
            {
                "period": "monthly",
                "interval": 1,
                "item": {
                    "name": name,
                    "amount": amount_paise,
                    "currency": "INR",
                },
            },
        )

    def create_subscription(
        self,
        plan_id: str,
        notes: dict[str, str],
        offer_id: str | None = None,
        start_at: int | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "plan_id": plan_id,
            "total_count": MONTHLY_TOTAL_COUNT,
            "customer_notify": 1,
            "notes": notes,
        }
        if offer_id:
            body["offer_id"] = offer_id
        if start_at:
            # First charge on this date (unix seconds) instead of right away.
            body["start_at"] = start_at
        return self._request("POST", "/subscriptions", body)

    def create_order(
        self, amount_paise: int, receipt: str, notes: dict[str, str]
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            "/orders",
            {
                "amount": amount_paise,
                "currency": "INR",
                "receipt": receipt,
                "notes": notes,
            },
        )

    def fetch_subscription(self, subscription_id: str) -> dict[str, Any]:
        return self._request("GET", f"/subscriptions/{subscription_id}")

    def fetch_order(self, order_id: str) -> dict[str, Any]:
        return self._request("GET", f"/orders/{order_id}")

    def fetch_payment(self, payment_id: str) -> dict[str, Any]:
        return self._request("GET", f"/payments/{payment_id}")

    def cancel_subscription(
        self, subscription_id: str, at_cycle_end: bool = True
    ) -> dict[str, Any]:
        """Cancel at the end of the paid cycle, or at once when told to."""
        return self._request(
            "POST",
            f"/subscriptions/{subscription_id}/cancel",
            {"cancel_at_cycle_end": 1 if at_cycle_end else 0},
        )


def _build() -> RazorpayClient:
    return RazorpayClient(
        settings.razorpay_key_id, settings.razorpay_key_secret
    )


def get_razorpay_optional() -> RazorpayClient | None:
    """For the webhook, which must still be acknowledged without API keys."""
    return _build() if settings.razorpay_enabled else None


def get_razorpay() -> RazorpayClient:
    """FastAPI dependency; 503 when payments aren't configured."""
    if not settings.razorpay_enabled:
        raise HTTPException(
            status_code=503, detail="Online payments aren't set up yet."
        )
    return _build()
