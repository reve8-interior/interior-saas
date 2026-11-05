"""One-time email invites: the account owner proves they own the address and
chooses their own password, so no password is ever handed over.

Only a SHA-256 of the token is stored; the raw token exists in the email.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.logging import logger
from ..core.security import get_password_hash
from ..models.user import User
from . import email_templates
from .mailer import MailError, send_email

INVALID_INVITE = "This invite link is invalid or has expired."


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def unusable_password_hash() -> str:
    """A hash nobody knows, so the account can't be entered before accepting."""
    return get_password_hash(secrets.token_urlsafe(32))


def issue_invite(
    user: User,
    business_name: str | None,
    reply_to: str | None = None,
    *,
    from_platform: bool = False,
) -> None:
    """Arm `user` with a fresh token and email the link.

    Sent under the business's name, or the platform's (the SMTP_FROM name)
    when `from_platform` is set, e.g. when the platform onboards a business.

    Raises 502 if the mail server refuses; the caller's transaction should
    then be rolled back so no half-created account is left behind.
    """
    token = secrets.token_urlsafe(32)
    user.invite_token_hash = _hash(token)
    user.invite_expires_at = datetime.now(timezone.utc) + timedelta(
        hours=settings.invite_ttl_hours
    )
    link = f"{settings.frontend_url.rstrip('/')}/accept-invite?token={token}"
    team = business_name or "your team"
    mail = (
        email_templates.platform_welcome(team, link)
        if from_platform
        else email_templates.team_invite(team, link)
    )
    try:
        send_email(
            user.email,
            mail.subject,
            mail.text,
            html=mail.html,
            from_name=None if from_platform else business_name,
            reply_to=reply_to,
        )
    except MailError:
        raise HTTPException(
            status_code=502,
            detail="Could not send the invite email. Check the email "
            "settings and try again.",
        )
    logger.info("invite_sent", user_id=str(user.id))


def accept_invite(db: Session, token: str, new_password: str) -> User:
    """Consume the token, set the password and mark the email verified."""
    user = db.execute(
        select(User).where(User.invite_token_hash == _hash(token))
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if (
        user is None
        or user.invite_expires_at is None
        or user.invite_expires_at < now
    ):
        raise HTTPException(status_code=400, detail=INVALID_INVITE)
    user.password_hash = get_password_hash(new_password)
    user.must_change_password = False
    user.email_verified_at = now
    user.invite_token_hash = None
    user.invite_expires_at = None
    return user
