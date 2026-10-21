"""Payment countdown: free-access window per business, controlled by admin."""

import math
from datetime import UTC, datetime

from ..models.business import Business
from ..schemas.auth import AccessStatus

SECONDS_PER_DAY = 86400


def days_left(business: Business, now: datetime | None = None) -> int | None:
    """Whole days until access ends (0 = last day); None = no limit set."""
    if business.access_expires_at is None:
        return None
    now = now or datetime.now(UTC)
    remaining = (business.access_expires_at - now).total_seconds()
    return max(math.ceil(remaining / SECONDS_PER_DAY), 0)


def is_expired(business: Business, now: datetime | None = None) -> bool:
    """True once the paid/free window has passed."""
    if business.access_expires_at is None:
        return False
    return (now or datetime.now(UTC)) >= business.access_expires_at


def access_status(business: Business | None) -> AccessStatus:
    """Countdown state shown to tenant users."""
    if business is None:
        return AccessStatus()
    if business.access_expires_at is None:
        return AccessStatus(plan=business.plan)
    return AccessStatus(
        plan=business.plan,
        expires_at=business.access_expires_at,
        days_left=days_left(business),
        warning_days=business.warning_days,
        expired=is_expired(business),
    )
