import uuid

import pytest

from backend.core.config import settings
from backend.models.design import Design, DesignSource
from backend.models.user import UserRole
from backend.services.storage import get_storage

from .conftest import (
    as_business,
    as_owner,
    auth,
    make_business,
    make_client_row,
    make_user,
)

URL = "/api/v1/projects/library"


@pytest.fixture(autouse=True)
def _tmp_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "storage_local_dir", str(tmp_path))
    get_storage.cache_clear()
    yield
    get_storage.cache_clear()


def _design(db, biz, client=None, **kw):
    kw.setdefault("image_url", "https://example.com/x.png")
    design = Design(
        id=uuid.uuid4(),
        business_id=biz.id,
        client_id=client.id if client else None,
        source=DesignSource.designer_uploaded,
        specs_json={},
        **kw,
    )
    db.add(design)
    db.flush()
    return design


def _setup(db, plan="solo"):
    biz = make_business(db, plan=plan)
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    return biz, user


def test_lists_client_and_clientless_designs(api, db):
    biz, user = _setup(db)
    client = make_client_row(db, name="Asha")
    owned = _design(db, biz, client, title="Living")
    loose = _design(db, biz, None, title="Uploaded")
    no_image = _design(db, biz, None, image_url=None)
    r = api.get(URL, headers=auth(user))
    assert r.status_code == 200, r.text
    by_id = {i["id"]: i for i in r.json()}
    assert str(no_image.id) not in by_id
    assert by_id[str(owned.id)]["client_name"] == "Asha"
    assert by_id[str(owned.id)]["thumb_url"] == "https://example.com/x.png"
    assert by_id[str(loose.id)]["client_name"] is None
    assert by_id[str(loose.id)]["project_id"] is None


def test_other_business_not_listed(api, db):
    biz, user = _setup(db)
    as_owner(db)
    other = make_business(db, plan="solo")
    mine = _design(db, biz)
    theirs = _design(db, other)
    ids = {i["id"] for i in api.get(URL, headers=auth(user)).json()}
    assert str(mine.id) in ids
    assert str(theirs.id) not in ids


def test_free_plan_403(api, db):
    _, user = _setup(db, plan="free")
    assert api.get(URL, headers=auth(user)).status_code == 403
