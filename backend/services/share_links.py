"""Shared helpers for public share links (client, portfolio, quotation)."""

import re
import secrets
import unicodedata
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


# No 0/o/1/l/i: the suffix gets read out and retyped.
_SUFFIX_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
_SUFFIX_LENGTH = 8
_SLUG_MAX = 30


def readable_token(label: str) -> str:
    """A link a person can read, e.g. `mrs-rao-k7m2xq4p`.

    The name makes it recognisable; the random suffix (about 40 bits) keeps
    it from being guessed, so it is as private as a long token.
    """
    ascii_label = (
        unicodedata.normalize("NFKD", label)
        .encode("ascii", "ignore")
        .decode()
        .lower()
    )
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_label).strip("-")[:_SLUG_MAX]
    suffix = "".join(
        secrets.choice(_SUFFIX_ALPHABET) for _ in range(_SUFFIX_LENGTH)
    )
    return f"{slug.strip('-')}-{suffix}" if slug else suffix


def is_readable(token: str) -> bool:
    """True for tokens made by `readable_token`; old random ones are longer."""
    return len(token) <= _SLUG_MAX + 1 + _SUFFIX_LENGTH


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
