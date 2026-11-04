import io

import pytest

from backend.core.config import settings
from backend.models.user import UserRole
from backend.services.storage import get_storage, signed_media_url

from .conftest import as_business, auth, make_business, make_user

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
SVG = b"<svg xmlns='http://www.w3.org/2000/svg'></svg>"


@pytest.fixture(autouse=True)
def _tmp_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "storage_local_dir", str(tmp_path))
    get_storage.cache_clear()
    yield
    get_storage.cache_clear()


def _post(api, user, kind="logo", data=PNG, name="a.png"):
    return api.post(
        f"/api/v1/site/{kind}",
        headers=auth(user),
        files={"file": (name, io.BytesIO(data), "image/png")},
    )


def _setup(db, role=UserRole.admin):
    biz = make_business(db)
    user = make_user(db, role=role, business=biz)
    as_business(db, biz.id)
    return biz, user


def test_logo_upload_ok(api, db):
    biz, user = _setup(db)
    r = _post(api, user)
    assert r.status_code == 200
    db.refresh(biz)
    assert biz.logo_path.startswith(f"branding/{biz.id}/logo-")
    assert biz.logo_path.endswith(".png")
    assert get_storage().get(biz.logo_path) == PNG
    first = biz.logo_path
    # media endpoint serves it raw
    url = r.json()["url"]
    assert api.get(url[url.index("/api/") :]).content == PNG
    # replacing deletes the old object
    assert _post(api, user).status_code == 200
    db.refresh(biz)
    assert biz.logo_path != first
    with pytest.raises(Exception):
        get_storage().get(first)


def test_hero_upload_sets_hero_path(api, db):
    biz, user = _setup(db)
    assert _post(api, user, "hero").status_code == 200
    db.refresh(biz)
    assert biz.hero_path.startswith(f"branding/{biz.id}/hero-")
    assert biz.logo_path is None


def test_svg_rejected_415(api, db):
    _, user = _setup(db)
    assert _post(api, user, data=SVG, name="a.svg").status_code == 415


def test_oversize_413(api, db, monkeypatch):
    _, user = _setup(db)
    monkeypatch.setattr(settings, "max_image_bytes", 32)
    assert _post(api, user).status_code == 413


@pytest.mark.parametrize("role", [UserRole.viewer, UserRole.designer])
def test_non_admin_forbidden(api, db, role):
    _, user = _setup(db, role)
    assert _post(api, user).status_code == 403


def test_media_serves_branding_prefix(api, db):
    get_storage().put("branding/x/logo-1.png", PNG, "image/png")
    url = signed_media_url("branding/x/logo-1.png")
    r = api.get(url[url.index("/api/") :])
    assert r.status_code == 200
    assert r.content == PNG
    other = signed_media_url("secrets/x.png")
    assert api.get(other[other.index("/api/") :]).status_code == 404
