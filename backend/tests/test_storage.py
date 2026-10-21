"""Object storage backends, magic-byte sniffing and signed media URLs."""

import time
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from backend.core.config import settings
from backend.services import storage
from backend.services.storage import (
    LocalStorage,
    StorageError,
    SupabaseStorage,
    content_type_for,
    signed_media_url,
    sniff_image_ext,
    verify_media_signature,
)

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 8


@pytest.mark.parametrize(
    ("data", "ext"),
    [
        (JPEG, "jpg"),
        (PNG, "png"),
        (WEBP, "webp"),
        (b"GIF89a....", None),
        (b"%PDF-1.7", None),
        (b"RIFF\x00\x00\x00\x00WAVE", None),
        (b"", None),
    ],
)
def test_sniff_image_ext(data, ext):
    assert sniff_image_ext(data) == ext


@pytest.mark.parametrize(
    ("path", "content_type"),
    [
        ("a/b.jpg", "image/jpeg"),
        ("a/b.png", "image/png"),
        ("a/b.webp", "image/webp"),
        ("a/b.exe", "application/octet-stream"),
        ("noext", "application/octet-stream"),
    ],
)
def test_content_type_for(path, content_type):
    assert content_type_for(path) == content_type


class TestLocalStorage:
    def test_round_trip_creates_parent_dirs(self, tmp_path):
        store = LocalStorage(str(tmp_path))
        store.put("biz/client/x.png", PNG, "image/png")
        assert store.get("biz/client/x.png") == PNG

    def test_get_missing_raises(self, tmp_path):
        with pytest.raises(StorageError):
            LocalStorage(str(tmp_path)).get("nope.png")

    def test_delete_is_idempotent(self, tmp_path):
        store = LocalStorage(str(tmp_path))
        store.put("x.png", PNG, "image/png")
        store.delete("x.png")
        store.delete("x.png")
        with pytest.raises(StorageError):
            store.get("x.png")

    @pytest.mark.parametrize(
        "path", ["../escape.png", "a/../../escape.png", "", "."]
    )
    def test_rejects_paths_outside_base(self, tmp_path, path):
        store = LocalStorage(str(tmp_path / "base"))
        with pytest.raises(StorageError):
            store.put(path, PNG, "image/png")
        with pytest.raises(StorageError):
            store.get(path)
        with pytest.raises(StorageError):
            store.delete(path)
        assert not (tmp_path / "escape.png").exists()


class TestSupabaseStorage:
    @pytest.fixture
    def calls(self, monkeypatch):
        """Record httpx calls and let each test choose the response."""
        recorded: list[tuple[str, str, dict]] = []
        status = {"code": 200}

        def fake(method):
            def _call(url, **kw):
                recorded.append((method, url, kw))
                return httpx.Response(
                    status["code"],
                    content=b"bytes",
                    request=httpx.Request(method, url),
                )

            return _call

        for method in ("post", "get", "delete"):
            monkeypatch.setattr(httpx, method, fake(method.upper()))
        return recorded, status

    @pytest.fixture
    def store(self):
        return SupabaseStorage("https://sb.example/", "svc-key", "designs")

    def test_put_posts_with_service_key_and_content_type(self, calls, store):
        recorded, _ = calls
        store.put("a/b.png", PNG, "image/png")
        method, url, kw = recorded[0]
        assert method == "POST"
        assert url == "https://sb.example/storage/v1/object/designs/a/b.png"
        assert kw["content"] == PNG
        assert kw["headers"]["Authorization"] == "Bearer svc-key"
        assert kw["headers"]["Content-Type"] == "image/png"

    def test_put_failure_raises_without_leaking_body(self, calls, store):
        _, status = calls
        status["code"] = 500
        with pytest.raises(StorageError, match="500"):
            store.put("a.png", PNG, "image/png")

    def test_get_returns_bytes_or_raises(self, calls, store):
        _, status = calls
        assert store.get("a.png") == b"bytes"
        status["code"] = 404
        with pytest.raises(StorageError):
            store.get("a.png")

    def test_delete_tolerates_404_but_not_other_errors(self, calls, store):
        _, status = calls
        store.delete("a.png")
        status["code"] = 404
        store.delete("a.png")
        status["code"] = 403
        with pytest.raises(StorageError):
            store.delete("a.png")


def test_get_storage_selects_backend(tmp_path, monkeypatch):
    storage.get_storage.cache_clear()
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "storage_local_dir", str(tmp_path))
    assert isinstance(storage.get_storage(), LocalStorage)

    storage.get_storage.cache_clear()
    monkeypatch.setattr(settings, "storage_backend", "supabase")
    monkeypatch.setattr(settings, "supabase_url", "https://sb.example")
    monkeypatch.setattr(settings, "supabase_service_key", "k")
    monkeypatch.setattr(settings, "supabase_bucket", "b")
    assert isinstance(storage.get_storage(), SupabaseStorage)
    storage.get_storage.cache_clear()


class TestSignedUrls:
    @staticmethod
    def _parts(url):
        query = parse_qs(urlparse(url).query)
        return int(query["exp"][0]), query["sig"][0]

    def test_url_points_at_api_media_route(self, monkeypatch):
        monkeypatch.setattr(settings, "api_base_url", "https://api.test/")
        url = signed_media_url("biz/x.png")
        assert url.startswith("https://api.test/api/v1/media/biz/x.png?")

    def test_fresh_signature_verifies(self):
        exp, sig = self._parts(signed_media_url("biz/x.png"))
        assert verify_media_signature("biz/x.png", exp, sig)

    def test_signature_is_bound_to_path(self):
        exp, sig = self._parts(signed_media_url("biz/x.png"))
        assert not verify_media_signature("biz/other.png", exp, sig)

    def test_tampered_expiry_or_signature_is_rejected(self):
        exp, sig = self._parts(signed_media_url("biz/x.png"))
        assert not verify_media_signature("biz/x.png", exp + 3600, sig)
        assert not verify_media_signature("biz/x.png", exp, "0" * len(sig))

    def test_expired_link_is_rejected(self, monkeypatch):
        monkeypatch.setattr(settings, "media_url_ttl_seconds", -1)
        exp, sig = self._parts(signed_media_url("biz/x.png"))
        assert exp < time.time()
        assert not verify_media_signature("biz/x.png", exp, sig)

    def test_signature_depends_on_secret(self, monkeypatch):
        exp, sig = self._parts(signed_media_url("biz/x.png"))
        monkeypatch.setattr(settings, "jwt_secret", "a-different-secret")
        assert not verify_media_signature("biz/x.png", exp, sig)
