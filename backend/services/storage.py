"""Object storage for design images, plus signed URLs to serve them.

Two backends share one interface: Supabase Storage (private bucket, used in
production) and the local disk (development). Images are never public; the
API hands out short-lived HMAC-signed URLs that point back at this backend.
"""

import hashlib
import hmac
import io
import time
from collections.abc import Callable
from functools import lru_cache
from pathlib import Path
from typing import Protocol

import httpx
from PIL import Image, ImageOps

from ..core.config import settings

# Magic-byte sniffing: the client-supplied content type is never trusted.
_SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
)
CONTENT_TYPES: dict[str, str] = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}


THUMB_SUFFIX = ".thumb.jpg"
THUMB_MAX_PX = 640
_THUMB_QUALITY = 80

# What customers load on shared pages: far lighter than the original upload,
# still sharp enough to zoom into.
VIEW_SUFFIX = ".view.webp"
VIEW_MAX_PX = 1600
_VIEW_QUALITY = 82


class StorageError(Exception):
    """The storage backend failed or the object does not exist."""


class ObjectStorage(Protocol):
    def put(self, path: str, data: bytes, content_type: str) -> None: ...

    def get(self, path: str) -> bytes: ...

    def delete(self, path: str) -> None: ...


def sniff_image_ext(data: bytes) -> str | None:
    """Return 'jpg' | 'png' | 'webp' from the file's magic bytes, else None."""
    for signature, ext in _SIGNATURES:
        if data.startswith(signature):
            return ext
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def content_type_for(path: str) -> str:
    return CONTENT_TYPES.get(
        path.rsplit(".", 1)[-1], "application/octet-stream"
    )


class LocalStorage:
    """Files under a base directory. Development only (not multi-instance)."""

    def __init__(self, base_dir: str) -> None:
        self._base = Path(base_dir).resolve()

    def _resolve(self, path: str) -> Path:
        target = (self._base / path).resolve()
        if self._base not in target.parents:
            raise StorageError("Invalid storage path")
        return target

    def put(self, path: str, data: bytes, content_type: str) -> None:
        target = self._resolve(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def get(self, path: str) -> bytes:
        try:
            return self._resolve(path).read_bytes()
        except FileNotFoundError as exc:
            raise StorageError("Object not found") from exc

    def delete(self, path: str) -> None:
        self._resolve(path).unlink(missing_ok=True)


class SupabaseStorage:
    """Supabase Storage via its REST API with the service-role key."""

    def __init__(self, url: str, service_key: str, bucket: str) -> None:
        self._base = f"{url.rstrip('/')}/storage/v1/object/{bucket}"
        self._headers = {
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
        }

    def put(self, path: str, data: bytes, content_type: str) -> None:
        r = httpx.post(
            f"{self._base}/{path}",
            content=data,
            # Overwrite: Supabase answers 400 "Duplicate" for an existing key.
            headers={
                **self._headers,
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            timeout=30,
        )
        if r.status_code >= 300:
            raise StorageError(f"Upload failed ({r.status_code})")

    def get(self, path: str) -> bytes:
        r = httpx.get(
            f"{self._base}/{path}", headers=self._headers, timeout=30
        )
        if r.status_code >= 300:
            raise StorageError("Object not found")
        return r.content

    def delete(self, path: str) -> None:
        r = httpx.delete(
            f"{self._base}/{path}", headers=self._headers, timeout=30
        )
        if r.status_code >= 300 and r.status_code != 404:
            raise StorageError(f"Delete failed ({r.status_code})")


@lru_cache
def get_storage() -> ObjectStorage:
    if settings.storage_backend == "supabase":
        return SupabaseStorage(
            settings.supabase_url,
            settings.supabase_service_key,
            settings.supabase_bucket,
        )
    return LocalStorage(settings.storage_local_dir)


def _signature(path: str, exp: int) -> str:
    return hmac.new(
        settings.jwt_secret.encode(),
        f"media:{path}:{exp}".encode(),
        hashlib.sha256,
    ).hexdigest()


def _media_expiry(now: float) -> int:
    """Expiry for a new signed URL, held steady within a time window.

    A fresh `now + ttl` would give the same image a different URL on every
    page load, so browsers and CDNs could never reuse it. Rounding to a window
    boundary keeps the URL identical for half the TTL while every link still
    stays valid for at least half the TTL.
    """
    ttl = settings.media_url_ttl_seconds
    window = ttl // 2
    if window <= 0:
        return int(now) + ttl
    return (int(now) // window + 2) * window


def signed_media_url(path: str) -> str:
    """Time-limited URL for one stored object; no login needed to fetch it."""
    exp = _media_expiry(time.time())
    return (
        f"{settings.api_base_url.rstrip('/')}/api/v1/media/{path}"
        f"?exp={exp}&sig={_signature(path, exp)}"
    )


def verify_media_signature(path: str, exp: int, sig: str) -> bool:
    return exp >= time.time() and hmac.compare_digest(
        _signature(path, exp), sig
    )


def thumb_path(path: str) -> str:
    """Storage key of an image's thumbnail (`designs/c/x.png` -> `x.thumb.jpg`)."""
    return f"{path.rsplit('.', 1)[0]}{THUMB_SUFFIX}"


def signed_thumb_url(path: str) -> str:
    """Signed URL for the small JPEG preview of a stored image."""
    return signed_media_url(thumb_path(path))


def _downscale(
    data: bytes, max_px: int, fmt: str, quality: int, keep_alpha: bool
) -> bytes:
    """Fit an image inside max_px x max_px and re-encode it as `fmt`."""
    with Image.open(io.BytesIO(data)) as img:
        img = ImageOps.exif_transpose(img)
        has_alpha = img.mode in ("RGBA", "LA", "P")
        if has_alpha and keep_alpha:
            img = img.convert("RGBA")
        elif has_alpha:
            # Flatten transparency onto white; JPEG has no alpha channel.
            rgba = img.convert("RGBA")
            flat = Image.new("RGB", rgba.size, "white")
            flat.paste(rgba, mask=rgba.getchannel("A"))
            img = flat
        else:
            img = img.convert("RGB")
        img.thumbnail((max_px, max_px))
        out = io.BytesIO()
        img.save(out, fmt, quality=quality, optimize=True)
        return out.getvalue()


def make_thumbnail(data: bytes) -> bytes:
    """Downscale an image to a JPEG preview that fits THUMB_MAX_PX."""
    return _downscale(data, THUMB_MAX_PX, "JPEG", _THUMB_QUALITY, False)


def make_view_image(data: bytes) -> bytes:
    """Downscale an image to the WebP shown on shared pages (VIEW_MAX_PX)."""
    return _downscale(data, VIEW_MAX_PX, "WEBP", _VIEW_QUALITY, True)


def view_path(path: str) -> str:
    """Storage key of an image's shared-page version (`x.png` -> `x.view.webp`)."""
    return f"{path.rsplit('.', 1)[0]}{VIEW_SUFFIX}"


def signed_view_url(path: str) -> str:
    """Signed URL for the lighter version customers see on shared pages."""
    return signed_media_url(view_path(path))


def _load_or_create_variant(
    storage: ObjectStorage,
    path: str,
    suffix: str,
    build: Callable[[bytes], bytes],
    content_type: str,
) -> bytes:
    """Return a stored derived image, building it from the original on first use.

    Designs uploaded before a variant existed get it lazily, so no backfill
    job is needed.
    """
    try:
        return storage.get(path)
    except StorageError:
        pass
    stem = path.removesuffix(suffix)
    for ext in CONTENT_TYPES:
        try:
            original = storage.get(f"{stem}.{ext}")
        except StorageError:
            continue
        try:
            variant = build(original)
        except OSError as exc:
            raise StorageError("Image could not be decoded") from exc
        try:
            storage.put(path, variant, content_type)
        except StorageError:
            # Serving the fresh image still works; it is rebuilt next time.
            pass
        return variant
    raise StorageError("Object not found")


def load_or_create_thumbnail(storage: ObjectStorage, path: str) -> bytes:
    """Return a stored thumbnail, building it from the original on first use."""
    return _load_or_create_variant(
        storage, path, THUMB_SUFFIX, make_thumbnail, CONTENT_TYPES["jpg"]
    )


def load_or_create_view(storage: ObjectStorage, path: str) -> bytes:
    """Return a stored shared-page image, building it on first use."""
    return _load_or_create_variant(
        storage, path, VIEW_SUFFIX, make_view_image, CONTENT_TYPES["webp"]
    )
