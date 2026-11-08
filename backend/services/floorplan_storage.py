"""Keep the floor-plan image a meeting's rows were drafted from."""

from __future__ import annotations

import re
import uuid

from fastapi import HTTPException

from ..core.logging import logger
from .design_images import delete_design_objects, store_derived_images
from .storage import CONTENT_TYPES, StorageError, get_storage

_PATH_RE = re.compile(
    r"^floorplans/(?P<client>[0-9a-f-]{36})/[0-9a-f-]{36}\.(jpg|png|webp)"
)


def store_floorplan_image(client_id: str, data: bytes, ext: str) -> str:
    """Save the original plus its derived sizes; return the storage key."""
    path = f"floorplans/{client_id}/{uuid.uuid4()}.{ext}"
    try:
        get_storage().put(path, data, CONTENT_TYPES[ext])
    except StorageError:
        logger.exception("floorplan_store_failed", client_id=client_id)
        raise HTTPException(status_code=502, detail="Could not store the plan")
    store_derived_images(path, data)
    return path


def validate_floorplan_path(path: str | None, client_id: str) -> str | None:
    """Accept only a key issued for this client; anything else is a 422."""
    if path is None:
        return None
    match = _PATH_RE.fullmatch(path)
    if not match or match.group("client") != client_id:
        raise HTTPException(status_code=422, detail="Invalid plan image")
    return path


def delete_floorplan_image(path: str | None) -> None:
    """Remove the plan and its derived sizes (best effort)."""
    delete_design_objects(path)
