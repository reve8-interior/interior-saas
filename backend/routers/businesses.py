import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.config import settings
from ..core.logging import logger
from ..core.security import get_password_hash
from ..models.business import Business
from ..models.user import User, UserRole
from ..schemas.business import (
    BusinessCreate,
    BusinessRead,
    BusinessUpdate,
    OpenAISettingsUpdate,
)
from ..schemas.business_user import ResendInviteResponse
from ..services import audit, invites
from ..services.image_quota import uploaded_image_count
from ..services.plan_limits import (
    effective_limits,
    ensure_plan_exists,
    usage_summary,
)
from ..services.secret_box import encrypt_secret
from ..services.subscription import access_status
from ..services.team import reset_password, seats_used
from .deps import require_superadmin

router = APIRouter()


def _user_count(business_id: uuid.UUID, db: Session) -> int:
    return (
        db.scalar(
            select(func.count(User.id)).where(User.business_id == business_id)
        )
        or 0
    )


def _to_read(business: Business, db: Session) -> BusinessRead:
    read = BusinessRead.model_validate(business)
    read.user_count = _user_count(business.id, db)
    read.seats_used = seats_used(business.id, db)
    read.image_count = uploaded_image_count(business.id, db)
    read.limits = effective_limits(db, business)
    read.plan_name = read.limits.plan_name
    read.usage = usage_summary(db, business)
    status = access_status(business)
    read.days_left = status.days_left
    read.access_expired = status.expired
    return read


def _plain(value: object) -> object:
    """JSON-safe value for an audit payload."""
    return value.isoformat() if isinstance(value, datetime) else value


def _business_or_404(business_id: uuid.UUID, db: Session) -> Business:
    business = db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


def _ensure_name_free(
    name: str, db: Session, exclude_id: uuid.UUID | None = None
) -> None:
    q = select(Business.id).where(func.lower(Business.name) == name.lower())
    if exclude_id:
        q = q.where(Business.id != exclude_id)
    if db.execute(q).first():
        raise HTTPException(
            status_code=409, detail="A business with this name already exists"
        )


@router.get("", response_model=list[BusinessRead])
def list_businesses(
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    counts = {
        bid: n
        for bid, n in db.execute(
            select(User.business_id, func.count(User.id))
            .where(User.business_id.is_not(None))
            .group_by(User.business_id)
        ).all()
    }
    active_counts = {
        bid: n
        for bid, n in db.execute(
            select(User.business_id, func.count(User.id))
            .where(User.business_id.is_not(None), User.is_active.is_(True))
            .group_by(User.business_id)
        ).all()
    }
    businesses = db.execute(select(Business).order_by(Business.name)).scalars()
    result: list[BusinessRead] = []
    for business in businesses:
        read = BusinessRead.model_validate(business)
        read.user_count = counts.get(business.id, 0)
        read.seats_used = active_counts.get(business.id, 0)
        # The plan chip and access countdown on the admin list need these.
        read.limits = effective_limits(db, business)
        read.plan_name = read.limits.plan_name
        read.usage = usage_summary(db, business)
        status = access_status(business)
        read.days_left = status.days_left
        read.access_expired = status.expired
        result.append(read)
    return result


@router.post("", response_model=BusinessRead, status_code=201)
def create_business(
    body: BusinessCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    name = body.name.strip()
    _ensure_name_free(name, db)
    ensure_plan_exists(db, body.plan)
    admin_email = body.admin_email.lower() if body.admin_email else None
    if admin_email and db.scalar(
        select(User.id).where(func.lower(User.email) == admin_email)
    ):
        raise HTTPException(
            status_code=409, detail="Admin email already in use"
        )
    # No password given: email the admin an invite link when email is set up.
    # Otherwise a system-generated password is returned once so the
    # superadmin can hand it over.
    invite = bool(
        admin_email and not body.admin_password and settings.email_enabled
    )
    temporary_password = (
        (body.admin_password or secrets.token_urlsafe(12))
        if admin_email and not invite
        else None
    )

    business = Business(
        name=name,
        # One email for the business: the admin's unless a contact is given.
        contact_email=body.contact_email or admin_email,
        contact_phone=body.contact_phone,
        plan=body.plan,
        access_expires_at=body.access_expires_at,
        warning_days=body.warning_days,
        ai_credit_bonus=body.ai_credit_bonus,
        max_users=body.max_users,
        max_images=body.max_images,
        max_image_mb=body.max_image_mb,
        max_clients=body.max_clients,
        max_quotation_versions=body.max_quotation_versions,
        max_portfolio_designs=body.max_portfolio_designs,
    )
    db.add(business)
    db.flush()
    if admin_email:
        admin = User(
            email=admin_email,
            full_name=body.admin_name,
            password_hash=(
                get_password_hash(temporary_password)
                if temporary_password
                else invites.unusable_password_hash()
            ),
            role=UserRole.admin,
            business_id=business.id,
            must_change_password=True,
        )
        db.add(admin)
        if invite:
            db.flush()
            try:
                invites.issue_invite(admin, name, from_platform=True)
            except HTTPException:
                db.rollback()
                raise
    audit.record(
        db,
        actor=current_user,
        business_id=business.id,
        action="business.created",
        entity_type="business",
        entity_id=business.id,
        payload={
            "name": name,
            "plan": body.plan,
            "admin_email": admin_email,
        },
    )
    db.commit()
    db.refresh(business)
    logger.info(
        "business_created",
        business_id=str(business.id),
        by=str(current_user.id),
    )
    read = _to_read(business, db)
    if not body.admin_password:
        read.temporary_password = temporary_password
    read.invite_sent = invite
    return read


@router.post(
    "/{business_id}/resend-invite", response_model=ResendInviteResponse
)
def resend_invite(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    """Re-send the welcome email to the business admin who hasn't set up yet."""
    _business_or_404(business_id, db)
    admin = (
        db.execute(
            select(User)
            .where(
                User.business_id == business_id,
                User.role == UserRole.admin,
                User.is_active.is_(True),
                or_(
                    User.invite_token_hash.is_not(None),
                    User.must_change_password.is_(True)
                    & User.last_login_at.is_(None),
                ),
            )
            .order_by(User.created_at)
        )
        .scalars()
        .first()
    )
    if admin is None:
        raise HTTPException(
            status_code=409,
            detail="The admin has already set up their account. Use the "
            "Users tab to reset a password.",
        )
    result = reset_password(business_id, admin, None, db, actor)
    return ResendInviteResponse(email=admin.email, **result.model_dump())


def _refuse_plan_change_under_subscription(
    business: Business, new_plan: str
) -> None:
    """A live monthly subscription renews the plan it was bought for.

    Changing the plan here would be undone by the next renewal and leave the
    customer paying for something else, so the subscription goes first.
    """
    if (
        new_plan != business.plan
        and business.billing_cycle == "monthly"
        and business.subscription_status in ("active", "pending")
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "This business pays by monthly subscription, so the plan "
                "would revert at the next renewal. Ask them to change or "
                "cancel the subscription on their billing page first."
            ),
        )


@router.patch("/{business_id}", response_model=BusinessRead)
def update_business(
    business_id: uuid.UUID,
    body: BusinessUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    business = _business_or_404(business_id, db)
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes:
        if changes["name"] is None:
            raise HTTPException(status_code=422, detail="name cannot be null")
        changes["name"] = changes["name"].strip()
        _ensure_name_free(changes["name"], db, exclude_id=business.id)
    for non_null in ("warning_days", "plan", "ai_credit_bonus"):
        if non_null in changes and changes[non_null] is None:
            raise HTTPException(
                status_code=422, detail=f"{non_null} cannot be null"
            )
    if "plan" in changes:
        ensure_plan_exists(db, changes["plan"])
        _refuse_plan_change_under_subscription(business, changes["plan"])
    diff = {
        field: {"from": _plain(getattr(business, field)), "to": _plain(value)}
        for field, value in changes.items()
        if getattr(business, field) != value
    }
    for field, value in changes.items():
        setattr(business, field, value)
    if diff:
        audit.record(
            db,
            actor=actor,
            business_id=business.id,
            action="business.updated",
            entity_type="business",
            entity_id=business.id,
            payload={"changes": diff},
        )
    db.commit()
    db.refresh(business)
    return _to_read(business, db)


def _set_active(
    business_id: uuid.UUID, active: bool, db: Session, actor: User
) -> BusinessRead:
    business = _business_or_404(business_id, db)
    business.is_active = active
    audit.record(
        db,
        actor=actor,
        business_id=business.id,
        action="business.activated" if active else "business.deactivated",
        entity_type="business",
        entity_id=business.id,
    )
    db.commit()
    db.refresh(business)
    logger.info(
        "business_activated" if active else "business_deactivated",
        business_id=str(business.id),
        by=str(actor.id),
    )
    return _to_read(business, db)


@router.post("/{business_id}/activate", response_model=BusinessRead)
def activate_business(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    return _set_active(business_id, True, db, current_user)


@router.post("/{business_id}/deactivate", response_model=BusinessRead)
def deactivate_business(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    return _set_active(business_id, False, db, current_user)


@router.put("/{business_id}/openai", response_model=BusinessRead)
def set_openai_settings(
    business_id: uuid.UUID,
    body: OpenAISettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    business = _business_or_404(business_id, db)
    if body.api_key is not None:
        business.openai_api_key_enc = encrypt_secret(body.api_key)
        business.openai_key_last4 = body.api_key[-4:]
        business.openai_key_updated_at = datetime.now(timezone.utc)
    if body.chat_model is not None:
        business.openai_chat_model = body.chat_model or None
    if body.whisper_model is not None:
        business.openai_whisper_model = body.whisper_model or None
    db.commit()
    db.refresh(business)
    # The key itself is never logged.
    logger.info(
        "business_openai_settings_set",
        business_id=str(business.id),
        key_changed=body.api_key is not None,
        chat_model=business.openai_chat_model,
        whisper_model=business.openai_whisper_model,
        by=str(current_user.id),
    )
    return _to_read(business, db)


@router.delete("/{business_id}/openai-key", response_model=BusinessRead)
def clear_openai_key(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    business = _business_or_404(business_id, db)
    business.openai_api_key_enc = None
    business.openai_key_last4 = None
    business.openai_key_updated_at = None
    db.commit()
    db.refresh(business)
    logger.info(
        "business_openai_key_cleared",
        business_id=str(business.id),
        by=str(current_user.id),
    )
    return _to_read(business, db)
