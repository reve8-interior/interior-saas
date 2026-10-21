"""Serves stored design images to holders of a signed, expiring URL."""

from fastapi import APIRouter, HTTPException, Query, Response

from ..services.storage import (
    StorageError,
    content_type_for,
    get_storage,
    verify_media_signature,
)

router = APIRouter()


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
        data = get_storage().get(path)
    except StorageError:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(
        content=data,
        media_type=content_type_for(path),
        headers={
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        },
    )
