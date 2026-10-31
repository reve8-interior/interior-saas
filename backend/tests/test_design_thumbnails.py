import io
import uuid
from urllib.parse import urlsplit

import pytest
from PIL import Image

from backend.core.config import settings
from backend.services.storage import (
    THUMB_MAX_PX,
    get_storage,
    make_thumbnail,
    thumb_path,
)

from .conftest import (
    as_business,
    auth,
    make_business,
    make_client_row,
    make_user,
)


@pytest.fixture(autouse=True)
def _tmp_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "storage_local_dir", str(tmp_path))
    get_storage.cache_clear()
    yield
    get_storage.cache_clear()


def _png(width: int, height: int, mode: str = "RGB") -> bytes:
    out = io.BytesIO()
    Image.new(mode, (width, height), "red").save(out, "PNG")
    return out.getvalue()


def _setup(db):
    biz = make_business(db)
    user = make_user(db, business=biz)
    as_business(db, biz.id)
    return user, make_client_row(db, assigned_designer_id=user.id)


def _upload(api, user, client, data: bytes):
    return api.post(
        f"/api/v1/clients/{client.id}/designs/upload",
        headers=auth(user),
        files={"file": ("a.png", io.BytesIO(data), "image/png")},
    )


def _fetch(api, url: str):
    parts = urlsplit(url)
    return api.get(f"{parts.path}?{parts.query}")


def test_thumbnail_fits_bound_and_is_jpeg():
    thumb = Image.open(io.BytesIO(make_thumbnail(_png(3000, 1500))))
    assert thumb.format == "JPEG"
    assert max(thumb.size) == THUMB_MAX_PX


def test_small_image_is_not_upscaled():
    thumb = Image.open(io.BytesIO(make_thumbnail(_png(100, 80))))
    assert thumb.size == (100, 80)


def test_transparent_png_is_flattened():
    thumb = Image.open(io.BytesIO(make_thumbnail(_png(50, 50, "RGBA"))))
    assert thumb.mode == "RGB"


def test_upload_returns_a_smaller_thumb_url(api, db):
    user, client = _setup(db)
    r = _upload(api, user, client, _png(2400, 1600))
    assert r.status_code == 201
    body = r.json()
    assert body["thumb_url"] != body["image_url"]
    thumb = _fetch(api, body["thumb_url"])
    full = _fetch(api, body["image_url"])
    assert thumb.status_code == 200
    assert thumb.headers["content-type"] == "image/jpeg"
    assert len(thumb.content) < len(full.content)


def test_thumbnail_is_built_lazily_for_older_designs(api, db):
    user, client = _setup(db)
    body = _upload(api, user, client, _png(1200, 900)).json()
    path = f"designs/{client.id}/{body['id']}.png"
    get_storage().delete(thumb_path(path))
    assert _fetch(api, body["thumb_url"]).status_code == 200
    assert get_storage().get(thumb_path(path))


def test_undecodable_image_gets_no_thumbnail_but_still_uploads(api, db):
    user, client = _setup(db)
    fake = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    r = _upload(api, user, client, fake)
    assert r.status_code == 201
    assert _fetch(api, r.json()["thumb_url"]).status_code == 404


def test_unsigned_thumbnail_is_refused(api):
    path = f"designs/{uuid.uuid4()}/{uuid.uuid4()}.thumb.jpg"
    assert (
        api.get(f"/api/v1/media/{path}?exp=9999999999&sig=bad").status_code
        == 404
    )


def test_delete_removes_the_thumbnail(api, db):
    user, client = _setup(db)
    body = _upload(api, user, client, _png(800, 600)).json()
    path = f"designs/{client.id}/{body['id']}.png"
    r = api.delete(
        f"/api/v1/clients/{client.id}/designs/{body['id']}",
        headers=auth(user),
    )
    assert r.status_code == 204
    with pytest.raises(Exception):
        get_storage().get(thumb_path(path))


def test_design_count_matches_uploads(api, db):
    user, client = _setup(db)
    url = f"/api/v1/clients/{client.id}/designs/count"
    assert api.get(url, headers=auth(user)).json() == {"count": 0}
    _upload(api, user, client, _png(100, 100))
    _upload(api, user, client, _png(100, 100))
    assert api.get(url, headers=auth(user)).json() == {"count": 2}


def test_design_count_hides_clients_a_designer_cannot_see(api, db):
    user, _ = _setup(db)
    colleague = make_user(db, business=user.business)
    foreign = make_client_row(db, assigned_designer_id=colleague.id)
    r = api.get(
        f"/api/v1/clients/{foreign.id}/designs/count", headers=auth(user)
    )
    assert r.status_code == 404
