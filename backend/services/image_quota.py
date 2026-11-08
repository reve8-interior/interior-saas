"""Per-business limits on uploaded design images (set by the platform admin)."""

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.business import Business
from ..models.checkpoint import Checkpoint
from ..models.client import Client
from ..models.design import Design
from .plan_limits import effective_limits

MB = 1024 * 1024


def effective_max_bytes(business: Business | None, db: Session) -> int:
    """The business's per-image cap, never above the global hard limit."""
    if business is None:
        return settings.max_image_bytes
    max_mb = effective_limits(db, business).max_image_mb
    if max_mb is None:
        return settings.max_image_bytes
    return min(max_mb * MB, settings.max_image_bytes)


def uploaded_image_count(business_id: object, db: Session) -> int:
    """Designs plus floor plans kept on meetings: both are stored images."""
    designs = db.scalar(
        select(func.count(Design.id)).where(
            Design.business_id == business_id,
            Design.storage_path.is_not(None),
        )
    )
    floor_plans = db.scalar(
        select(func.count(Checkpoint.id))
        .join(Client, Checkpoint.client_id == Client.id)
        .where(
            Client.business_id == business_id,
            Checkpoint.source_image_path.is_not(None),
        )
    )
    return (designs or 0) + (floor_plans or 0)


def ensure_can_upload(business: Business | None, db: Session) -> None:
    """Raise 403 when the business has used up its image allowance."""
    if business is None:
        return
    limit = effective_limits(db, business).max_images
    if limit is not None and uploaded_image_count(business.id, db) >= limit:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Image limit reached ({limit}). Delete an image or "
                "upgrade your plan to add more."
            ),
        )
