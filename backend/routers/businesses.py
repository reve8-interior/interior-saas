import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core import get_db
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
from ..services import audit
from ..services.image_quota import uploaded_image_count
from ..services.secret_box import encrypt_secret
from ..services.subscription import access_status
from ..services.team import seats_used
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
    counts = dict(
        db.execute(
            select(User.business_id, func.count(User.id))
            .where(User.business_id.is_not(None))
            .group_by(User.business_id)
        ).all()
    )
    active_counts = dict(
        db.execute(
            select(User.business_id, func.count(User.id))
            .where(User.business_id.is_not(None), User.is_active.is_(True))
            .group_by(User.business_id)
        ).all()
    )
    businesses = db.execute(select(Business).order_by(Business.name)).scalars()
    result: list[BusinessRead] = []
    for business in businesses:
        read = BusinessRead.model_validate(business)
        read.user_count = counts.get(business.id, 0)
        read.seats_used = active_counts.get(business.id, 0)
        result.append(read)
    return result


@router.post("", response_model=BusinessRead, status_code=201)
def create_business(
    body: BusinessCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    if bool(body.admin_email) != bool(body.admin_password):
        raise HTTPException(
            status_code=422,
            detail="admin_email and admin_password must be provided together",
        )
    name = body.name.strip()
    _ensure_name_free(name, db)
    admin_email = body.admin_email.lower() if body.admin_email else None
    if admin_email and db.scalar(
        select(User.id).where(func.lower(User.email) == admin_email)
    ):
        raise HTTPException(
            status_code=409, detail="Admin email already in use"
        )

    business = Business(
        name=name,
        contact_email=body.contact_email,
        contact_phone=body.contact_phone,
        plan=body.plan,
        access_expires_at=body.access_expires_at,
        warning_days=body.warning_days,
        max_users=body.max_users,
        max_images=body.max_images,
        max_image_mb=body.max_image_mb,
    )
    db.add(business)
    db.flush()
    # An explicit None ("unlimited") is swallowed by the column default on
    # INSERT, so write the limits again.
    business.max_users = body.max_users
    business.max_images = body.max_images
    business.max_image_mb = body.max_image_mb
    if admin_email and body.admin_password:
        db.add(
            User(
                email=admin_email,
                full_name=body.admin_name,
                password_hash=get_password_hash(body.admin_password),
                role=UserRole.admin,
                business_id=business.id,
                must_change_password=True,
            )
        )
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
            "max_users": body.max_users,
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
    return _to_read(business, db)


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
    for non_null in ("warning_days", "plan"):
        if non_null in changes and changes[non_null] is None:
            raise HTTPException(
                status_code=422, detail=f"{non_null} cannot be null"
            )
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
    if body.economy_model is not None:
        business.openai_model_economy = body.economy_model or None
    if body.balanced_model is not None:
        business.openai_model_balanced = body.balanced_model or None
    if body.premium_model is not None:
        business.openai_model_premium = body.premium_model or None
    if body.whisper_model is not None:
        business.openai_whisper_model = body.whisper_model or None
    db.commit()
    db.refresh(business)
    # The key itself is never logged.
    logger.info(
        "business_openai_settings_set",
        business_id=str(business.id),
        key_changed=body.api_key is not None,
        model_economy=business.openai_model_economy,
        model_balanced=business.openai_model_balanced,
        model_premium=business.openai_model_premium,
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
