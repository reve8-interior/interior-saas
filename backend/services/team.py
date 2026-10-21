"""Team management shared by the superadmin and business-admin routers.

Rules enforced here (not in the routers) so both entry points behave alike:
- active users consume seats; `Business.max_users` caps them (null = no cap)
- a business always keeps at least one active admin
- every change is written to the audit trail
"""

import secrets
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.logging import logger
from ..core.security import get_password_hash
from ..models.business import Business
from ..models.client import Client
from ..models.user import User, UserRole
from ..schemas.business_user import (
    BusinessUserCreate,
    BusinessUserRead,
    BusinessUserUpdate,
    TeamOverview,
)
from . import audit


def business_or_404(business_id: uuid.UUID, db: Session) -> Business:
    business = db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


def member_or_404(
    business_id: uuid.UUID, user_id: uuid.UUID, db: Session
) -> User:
    user = db.get(User, user_id)
    if not user or user.business_id != business_id:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def seats_used(business_id: uuid.UUID, db: Session) -> int:
    return (
        db.scalar(
            select(func.count(User.id)).where(
                User.business_id == business_id, User.is_active.is_(True)
            )
        )
        or 0
    )


def overview(business: Business, db: Session) -> TeamOverview:
    members = db.scalars(
        select(User)
        .where(User.business_id == business.id)
        .order_by(User.created_at)
    ).all()
    used = sum(1 for m in members if m.is_active)
    cap = business.max_users
    return TeamOverview(
        members=[BusinessUserRead.model_validate(m) for m in members],
        seats_used=used,
        max_users=cap,
        seats_left=None if cap is None else max(cap - used, 0),
    )


def _lock_business(business_id: uuid.UUID, db: Session) -> Business:
    """Serialise seat changes per business so two adds can't both fit."""
    business = db.scalar(
        select(Business).where(Business.id == business_id).with_for_update()
    )
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


def ensure_seat_free(business: Business, db: Session) -> None:
    if (
        business.max_users is not None
        and seats_used(business.id, db) >= business.max_users
    ):
        raise HTTPException(
            status_code=409,
            detail=f"Team limit reached ({business.max_users} active "
            "members). Disable a member or ask your platform "
            "administrator for more seats.",
        )


def _commit_unique(db: Session) -> None:
    """Commit, turning a lost email race into a 409.

    The pre-check can't see other businesses' users (row-level security),
    so the unique index is what actually enforces platform-wide emails.
    """
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already in use")


def ensure_email_free(
    email: str, db: Session, exclude_id: uuid.UUID | None = None
) -> None:
    q = select(User.id).where(func.lower(User.email) == email.lower())
    if exclude_id:
        q = q.where(User.id != exclude_id)
    if db.scalar(q):
        raise HTTPException(status_code=409, detail="Email already in use")


def _is_active_admin(user: User) -> bool:
    return user.role == UserRole.admin and user.is_active


def _ensure_admin_remains(
    business_id: uuid.UUID, db: Session, leaving: User
) -> None:
    """Block changes that would leave the business with no active admin."""
    others = db.scalar(
        select(func.count(User.id)).where(
            User.business_id == business_id,
            User.role == UserRole.admin,
            User.is_active.is_(True),
            User.id != leaving.id,
        )
    )
    if not others:
        raise HTTPException(
            status_code=409,
            detail="A business needs at least one active admin.",
        )


def _plain(value: object) -> object:
    return value.value if isinstance(value, UserRole) else value


def create_member(
    business_id: uuid.UUID,
    body: BusinessUserCreate,
    db: Session,
    actor: User,
) -> User:
    business = _lock_business(business_id, db)
    ensure_seat_free(business, db)
    email = body.email.lower()
    ensure_email_free(email, db)
    user = User(
        email=email,
        full_name=body.full_name,
        password_hash=get_password_hash(body.password),
        role=UserRole(body.role),
        business_id=business_id,
        must_change_password=True,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already in use")
    audit.record(
        db,
        actor=actor,
        business_id=business_id,
        action="team.member_added",
        entity_type="user",
        entity_id=user.id,
        payload={"email": email, "role": body.role},
    )
    db.commit()
    db.refresh(user)
    logger.info(
        "team_member_added",
        business_id=str(business_id),
        user_id=str(user.id),
        by=str(actor.id),
    )
    return user


def update_member(
    business_id: uuid.UUID,
    user: User,
    body: BusinessUserUpdate,
    db: Session,
    actor: User,
) -> User:
    changes = body.model_dump(exclude_unset=True)
    for non_null in ("email", "role", "is_active"):
        if non_null in changes and changes[non_null] is None:
            raise HTTPException(
                status_code=422, detail=f"{non_null} cannot be null"
            )
    business = _lock_business(business_id, db)
    if "email" in changes:
        changes["email"] = changes["email"].lower()
        ensure_email_free(changes["email"], db, exclude_id=user.id)
    if "role" in changes:
        changes["role"] = UserRole(changes["role"])

    new_role = changes.get("role", user.role)
    new_active = changes.get("is_active", user.is_active)
    if _is_active_admin(user) and not (
        new_role == UserRole.admin and new_active
    ):
        _ensure_admin_remains(business_id, db, user)
    if new_active and not user.is_active:
        ensure_seat_free(business, db)

    diff = {
        field: {"from": _plain(getattr(user, field)), "to": _plain(value)}
        for field, value in changes.items()
        if getattr(user, field) != value
    }
    for field, value in changes.items():
        setattr(user, field, value)
    if diff:
        audit.record(
            db,
            actor=actor,
            business_id=business_id,
            action="team.member_updated",
            entity_type="user",
            entity_id=user.id,
            payload={"email": user.email, "changes": diff},
        )
    _commit_unique(db)
    db.refresh(user)
    logger.info(
        "team_member_updated",
        business_id=str(business_id),
        user_id=str(user.id),
        fields=sorted(changes),
        by=str(actor.id),
    )
    return user


def reset_password(
    business_id: uuid.UUID,
    user: User,
    password: str | None,
    db: Session,
    actor: User,
) -> str:
    """Issue a temporary password; returned once, never logged or audited."""
    temporary = password or secrets.token_urlsafe(12)
    user.password_hash = get_password_hash(temporary)
    user.must_change_password = True
    audit.record(
        db,
        actor=actor,
        business_id=business_id,
        action="team.password_reset",
        entity_type="user",
        entity_id=user.id,
        payload={"email": user.email, "generated": password is None},
    )
    db.commit()
    logger.info(
        "team_member_password_reset",
        business_id=str(business_id),
        user_id=str(user.id),
        by=str(actor.id),
    )
    return temporary


def remove_member(
    business_id: uuid.UUID, user: User, db: Session, actor: User
) -> None:
    """Delete a login. Their clients move to the acting admin."""
    _lock_business(business_id, db)
    if _is_active_admin(user):
        _ensure_admin_remains(business_id, db, user)
    reassigned_to = actor.id if actor.business_id == business_id else None
    moved = db.execute(
        update(Client)
        .where(Client.assigned_designer_id == user.id)
        .values(assigned_designer_id=reassigned_to)
    ).rowcount
    audit.record(
        db,
        actor=actor,
        business_id=business_id,
        action="team.member_removed",
        entity_type="user",
        entity_id=user.id,
        payload={
            "email": user.email,
            "role": _plain(user.role),
            "clients_reassigned": moved,
        },
    )
    db.delete(user)
    db.commit()
    logger.info(
        "team_member_removed",
        business_id=str(business_id),
        user_id=str(user.id),
        by=str(actor.id),
    )
