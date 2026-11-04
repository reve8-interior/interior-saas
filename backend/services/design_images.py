"""Store an uploaded design image (original + derived sizes) as a Design."""

import uuid

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..core.logging import logger
from ..models.business import Business
from ..models.design import Design, DesignSource
from .image_quota import MB, effective_max_bytes
from .storage import (
    CONTENT_TYPES,
    StorageError,
    get_storage,
    make_thumbnail,
    make_view_image,
    sniff_image_ext,
    thumb_path,
    view_path,
)


def store_derived_images(path: str, data: bytes) -> None:
    """Best effort: a missing thumbnail or view image is rebuilt on first request."""
    storage = get_storage()
    for derived_path, build, content_type in (
        (thumb_path(path), make_thumbnail, CONTENT_TYPES["jpg"]),
        (view_path(path), make_view_image, CONTENT_TYPES["webp"]),
    ):
        try:
            storage.put(derived_path, build(data), content_type)
        except (StorageError, OSError):
            logger.warning("design_derived_image_failed", path=derived_path)


def delete_design_objects(path: str | None) -> None:
    """Remove a design's original, thumbnail and view image from storage."""
    if not path:
        return
    try:
        storage = get_storage()
        storage.delete(path)
        storage.delete(thumb_path(path))
        storage.delete(view_path(path))
    except StorageError:
        # The row is gone; an orphaned object is only wasted space.
        logger.warning("design_image_delete_failed", path=path)


def store_design_image(
    db: Session,
    business: Business | None,
    client_id: uuid.UUID | None,
    file: UploadFile,
    title: str | None,
    description: str | None,
    project_id: uuid.UUID | None = None,
    project_position: int | None = None,
) -> Design:
    """Validate, store and record an uploaded image (quota checked by caller).

    Client-less designs (website projects) live under the business folder.
    """
    limit = effective_max_bytes(business, db)
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"Image must be {limit // MB} MB or smaller",
        )
    ext = sniff_image_ext(data)
    if ext is None:
        raise HTTPException(
            status_code=415, detail="Only JPEG, PNG or WebP images"
        )

    business_id = business.id if business else None
    design_id = uuid.uuid4()
    folder = client_id or business_id
    path = f"designs/{folder}/{design_id}.{ext}"
    try:
        get_storage().put(path, data, CONTENT_TYPES[ext])
        store_derived_images(path, data)
    except StorageError:
        logger.exception("design_image_store_failed", folder=str(folder))
        raise HTTPException(status_code=502, detail="Could not store image")

    design = Design(
        id=design_id,
        business_id=business_id,
        client_id=client_id,
        source=DesignSource.designer_uploaded,
        title=title or (file.filename or None),
        storage_path=path,
        description=description,
        specs_json={},
        project_id=project_id,
        project_position=project_position,
    )
    db.add(design)
    db.commit()
    db.refresh(design)
    return design
