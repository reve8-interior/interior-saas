"""Shared helpers for public share links (client, portfolio, quotation)."""

import secrets
from datetime import datetime, timezone

from fastapi import HTTPException

from ..core.config import settings


def now() -> datetime:
    """Current UTC time, timezone-aware."""
    return datetime.now(timezone.utc)


def aware(value: datetime) -> datetime:
    """Treat naive datetimes as UTC."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def new_token() -> str:
    """Unguessable URL-safe token for a public link."""
    return secrets.token_urlsafe(32)


def is_expired(expires_at: datetime | None) -> bool:
    """True when an expiry is set and already passed."""
    return expires_at is not None and aware(expires_at) <= now()


def validate_future_expiry(expires_at: datetime | None) -> None:
    """Reject an expiry that is not in the future (422)."""
    if expires_at and is_expired(expires_at):
        raise HTTPException(
            status_code=422, detail="Expiry must be in the future"
        )


def public_url(kind: str, token: str) -> str:
    """Frontend URL for a public link, e.g. `<frontend>/share/<token>`."""
    return f"{settings.frontend_url.rstrip('/')}/{kind}/{token}"
