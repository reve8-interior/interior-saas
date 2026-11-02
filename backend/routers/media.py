"""Serves stored design images to holders of a signed, expiring URL."""

import time

from fastapi import APIRouter, HTTPException, Query, Response

from ..services.storage import (
    THUMB_SUFFIX,
    VIEW_SUFFIX,
    StorageError,
    content_type_for,
    get_storage,
    load_or_create_thumbnail,
    load_or_create_view,
    verify_media_signature,
)

router = APIRouter()

# Longest a browser or CDN may reuse an image without asking again.
_MAX_CACHE_SECONDS = 24 * 60 * 60


@router.get("/media/{path:path}", include_in_schema=False)
def get_media(
    path: str,
    exp: int = Query(...),
    sig: str = Query(...),
) -> Response:
    if not path.startswith("designs/") or not verify_media_signature(
        path, exp, sig
    ):
        raise HTTPException(status_code=404, detail="Not found")
    try:
        storage = get_storage()
        if path.endswith(THUMB_SUFFIX):
            data = load_or_create_thumbnail(storage, path)
        elif path.endswith(VIEW_SUFFIX):
            data = load_or_create_view(storage, path)
        else:
            data = storage.get(path)
    except StorageError:
        raise HTTPException(status_code=404, detail="Not found")
    # Cacheable by a CDN, but never past the link's own expiry.
    max_age = max(0, min(exp - int(time.time()), _MAX_CACHE_SECONDS))
    return Response(
        content=data,
        media_type=content_type_for(path),
        headers={
            "Cache-Control": f"public, max-age={max_age}",
            "X-Content-Type-Options": "nosniff",
        },
    )
