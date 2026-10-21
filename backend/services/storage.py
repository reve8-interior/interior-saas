"""Object storage for design images, plus signed URLs to serve them.

Two backends share one interface: Supabase Storage (private bucket, used in
production) and the local disk (development). Images are never public; the
API hands out short-lived HMAC-signed URLs that point back at this backend.
"""

import hashlib
import hmac
import time
from functools import lru_cache
from pathlib import Path
from typing import Protocol

import httpx

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
            headers={**self._headers, "Content-Type": content_type},
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


def signed_media_url(path: str) -> str:
    """Time-limited URL for one stored object; no login needed to fetch it."""
    exp = int(time.time()) + settings.media_url_ttl_seconds
    return (
        f"{settings.api_base_url.rstrip('/')}/api/v1/media/{path}"
        f"?exp={exp}&sig={_signature(path, exp)}"
    )


def verify_media_signature(path: str, exp: int, sig: str) -> bool:
    return exp >= time.time() and hmac.compare_digest(
        _signature(path, exp), sig
    )
