"""Shared FastAPI dependencies for auth and role enforcement."""

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..core import get_db
from ..core.database import scope_session
from ..core.security import decode_access_token
from ..models.user import User, UserRole
from ..services.subscription import is_expired


def get_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401, detail="Missing or invalid Authorization header"
        )
    return authorization.removeprefix("Bearer ")


def get_user_allow_expired(
    token: str = Depends(get_token),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(token)
        user_id: str = payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = (
        db.execute(
            select(User)
            .options(joinedload(User.business))
            .where(User.id == user_id)
        )
        .scalars()
        .first()
    )
    if not user or not user.is_active:
        raise HTTPException(
            status_code=401, detail="User not found or inactive"
        )
    if user.business and not user.business.is_active:
        raise HTTPException(status_code=403, detail="Business is deactivated")
    if user.role != UserRole.superadmin:
        # Everything after this point only sees the user's own business.
        scope_session(db, user.business_id)
    return user


_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
# Viewers may still manage their own account (profile, password).
_VIEWER_WRITABLE_PREFIX = "/api/v1/auth/"


def get_current_user(
    request: Request,
    user: User = Depends(get_user_allow_expired),
) -> User:
    """Authenticated user whose business still has paid/free access.

    Viewers are read-only: any state-changing request is refused here, so no
    router needs its own check.
    """
    if (
        user.role == UserRole.viewer
        and request.method not in _SAFE_METHODS
        and not request.url.path.startswith(_VIEWER_WRITABLE_PREFIX)
    ):
        raise HTTPException(
            status_code=403, detail="Your role is read-only (viewer)"
        )
    if user.must_change_password:
        raise HTTPException(status_code=403, detail="Password change required")
    if (
        user.role != UserRole.superadmin
        and user.business
        and is_expired(user.business)
    ):
        raise HTTPException(
            status_code=402,
            detail="Your access has expired. Contact your administrator "
            "to renew.",
        )
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_superadmin(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != UserRole.superadmin:
        raise HTTPException(
            status_code=403, detail="Superadmin access required"
        )
    return current_user


def require_business_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """A tenant admin: manages their own business's team."""
    if current_user.role != UserRole.admin or current_user.business_id is None:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
