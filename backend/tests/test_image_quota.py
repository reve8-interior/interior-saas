import io
import uuid

import pytest

from backend.core.config import settings
from backend.models.design import Design, DesignSource
from backend.services import image_quota
from backend.services.storage import get_storage

from .conftest import (
    as_business,
    auth,
    make_business,
    make_client_row,
    make_user,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture(autouse=True)
def _tmp_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "storage_local_dir", str(tmp_path))
    get_storage.cache_clear()
    yield
    get_storage.cache_clear()


def _setup(db, **biz_kw):
    biz = make_business(db, **biz_kw)
    user = make_user(db, business=biz)
    as_business(db, biz.id)
    client = make_client_row(db, assigned_designer_id=user.id)
    return biz, user, client


def _upload(api, user, client, data=PNG):
    return api.post(
        f"/api/v1/clients/{client.id}/designs/upload",
        headers=auth(user),
        files={"file": ("a.png", io.BytesIO(data), "image/png")},
    )


def test_upload_blocked_at_image_limit(api, db):
    _, user, client = _setup(db, max_images=1)
    assert _upload(api, user, client).status_code == 201
    r = _upload(api, user, client)
    assert r.status_code == 403
    assert "limit" in r.json()["detail"].lower()


def test_upload_unlimited_when_null(api, db):
    _, user, client = _setup(db, max_images=None)
    for _ in range(3):
        assert _upload(api, user, client).status_code == 201


def test_ai_designs_do_not_count(api, db):
    _, user, client = _setup(db, max_images=1)
    db.add(
        Design(
            id=uuid.uuid4(),
            client_id=client.id,
            source=DesignSource.ai_generated,
            image_url="https://example.com/x.png",
        )
    )
    db.flush()
    assert _upload(api, user, client).status_code == 201


def test_upload_blocked_over_business_size_cap(api, db):
    _, user, client = _setup(db, max_image_mb=1)
    big = PNG + b"\x00" * (1024 * 1024)
    assert _upload(api, user, client, big).status_code == 413


def test_effective_max_bytes_never_exceeds_global(db, monkeypatch):
    monkeypatch.setattr(settings, "max_image_bytes", 2 * image_quota.MB)
    biz = make_business(db, max_image_mb=50)
    assert image_quota.effective_max_bytes(biz) == 2 * image_quota.MB
    assert image_quota.effective_max_bytes(None) == 2 * image_quota.MB
