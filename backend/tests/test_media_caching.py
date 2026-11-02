"""Signed media responses: which variant is served and how long it caches."""

import time
from urllib.parse import parse_qs, urlparse

import pytest

from backend.core.config import settings
from backend.services import storage
from backend.services.storage import signed_media_url


def _expiry(url: str) -> int:
    return int(parse_qs(urlparse(url).query)["exp"][0])


@pytest.fixture(autouse=True)
def _tmp_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "storage_local_dir", str(tmp_path))
    storage.get_storage.cache_clear()
    yield
    storage.get_storage.cache_clear()


def _get(api, path: str):
    url = signed_media_url(path)
    return api.get(url[url.index("/api/") :])


def _max_age(response) -> int:
    value = response.headers["cache-control"]
    assert value.startswith("public, max-age=")
    return int(value.rsplit("=", 1)[1])


def test_response_is_cacheable_and_nosniff(api):
    storage.get_storage().put("designs/c/a.png", b"png-bytes", "image/png")
    r = _get(api, "designs/c/a.png")
    assert r.status_code == 200
    assert r.headers["x-content-type-options"] == "nosniff"
    assert 0 < _max_age(r) <= 24 * 3600


def test_cache_lifetime_never_outlives_the_link(api, monkeypatch):
    monkeypatch.setattr(settings, "media_url_ttl_seconds", 600)
    storage.get_storage().put("designs/c/a.png", b"x", "image/png")
    r = _get(api, "designs/c/a.png")
    exp = _expiry(signed_media_url("designs/c/a.png"))
    assert _max_age(r) <= exp - int(time.time())


def test_cache_lifetime_is_capped_at_a_day(api, monkeypatch):
    monkeypatch.setattr(settings, "media_url_ttl_seconds", 30 * 24 * 3600)
    storage.get_storage().put("designs/c/a.png", b"x", "image/png")
    assert _max_age(_get(api, "designs/c/a.png")) == 24 * 3600


def test_missing_object_is_404(api):
    assert _get(api, "designs/c/missing.png").status_code == 404


def test_view_variant_without_original_is_404(api):
    assert _get(api, "designs/c/missing.view.webp").status_code == 404
