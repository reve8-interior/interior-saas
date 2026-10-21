"""Per-business limits on uploaded design images (set by the platform admin)."""

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.business import Business
from ..models.client import Client
from ..models.design import Design

MB = 1024 * 1024


def effective_max_bytes(business: Business | None) -> int:
    """The business's per-image cap, never above the global hard limit."""
    if business is None or business.max_image_mb is None:
        return settings.max_image_bytes
    return min(business.max_image_mb * MB, settings.max_image_bytes)


def uploaded_image_count(business_id: object, db: Session) -> int:
    return (
        db.scalar(
            select(func.count(Design.id))
            .join(Client, Client.id == Design.client_id)
            .where(
                Client.business_id == business_id,
                Design.storage_path.is_not(None),
            )
        )
        or 0
    )


def ensure_can_upload(business: Business | None, db: Session) -> None:
    """Raise 403 when the business has used up its image allowance."""
    if business is None or business.max_images is None:
        return
    if uploaded_image_count(business.id, db) >= business.max_images:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Image limit reached ({business.max_images}). "
                "Delete an image or contact support to raise it."
            ),
        )
