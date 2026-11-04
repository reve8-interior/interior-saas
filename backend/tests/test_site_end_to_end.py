"""One chained walk through the website lifecycle over the HTTP API."""

import io

import pytest

from backend.core.config import settings
from backend.models.user import UserRole
from backend.services.storage import get_storage

from .conftest import as_business, auth, make_business, make_user

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture(autouse=True)
def _tmp_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "storage_local_dir", str(tmp_path))
    get_storage.cache_clear()
    yield
    get_storage.cache_clear()


def test_website_lifecycle(api, db):
    biz = make_business(db, plan="free")
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    headers = auth(user)

    # Free: set a slug, the public link is the simple gallery.
    r = api.put("/api/v1/site/slug", headers=headers, json={"slug": "acme"})
    assert r.status_code == 200
    assert api.get("/api/v1/site/acme").json()["mode"] == "gallery"

    # Upgrade: fill settings, add a project with an uploaded image, publish.
    biz.plan = "solo"
    db.flush()
    r = api.put(
        "/api/v1/site", headers=headers, json={"tagline": "Calm homes"}
    )
    assert r.status_code == 200
    r = api.post("/api/v1/projects", headers=headers, json={"title": "Villa"})
    assert r.status_code == 201
    project_id = r.json()["id"]
    r = api.post(
        f"/api/v1/projects/{project_id}/upload",
        headers=headers,
        files={"file": ("a.png", io.BytesIO(PNG), "image/png")},
    )
    assert r.status_code == 201
    assert api.post("/api/v1/site/publish", headers=headers).status_code == 200
    body = api.get("/api/v1/site/acme").json()
    assert body["mode"] == "site"
    assert [p["title"] for p in body["projects"]] == ["Villa"]

    # Rename: the old slug redirects.
    r = api.put("/api/v1/site/slug", headers=headers, json={"slug": "acme-2"})
    assert r.status_code == 200
    assert api.get("/api/v1/site/acme").json() == {
        "mode": "redirect",
        "slug": "acme-2",
    }
    assert api.get("/api/v1/site/acme-2").json()["mode"] == "site"

    # Unpublish: the site is hidden.
    assert (
        api.post("/api/v1/site/unpublish", headers=headers).status_code == 200
    )
    assert api.get("/api/v1/site/acme-2").status_code == 404

    # Republish then downgrade: gallery again, content kept.
    assert api.post("/api/v1/site/publish", headers=headers).status_code == 200
    biz.plan = "free"
    db.flush()
    assert api.get("/api/v1/site/acme-2").json()["mode"] == "gallery"
    # Content is retained: still listed, and back after re-upgrading.
    r = api.get("/api/v1/projects", headers=headers)
    assert [p["title"] for p in r.json()] == ["Villa"]
    biz.plan = "solo"
    db.flush()
    body = api.get("/api/v1/site/acme-2").json()
    assert body["mode"] == "site"
    assert [p["title"] for p in body["projects"]] == ["Villa"]
