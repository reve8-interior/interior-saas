from io import BytesIO

import pytest
from PIL import Image

from backend.models.checkpoint import Checkpoint, CheckpointSource
from backend.models.client import Client
from backend.models.design import Design, DesignHotspot
from backend.models.quotation import Quotation
from backend.models.quotation_message import QuotationMessage
from backend.models.quotation_version import QuotationShare, QuotationVersion
from backend.models.share_link import ShareLink
from backend.models.user import UserRole
from backend.services import sample_client
from backend.services.sample_client import SAMPLE_PREFIX
from backend.services.storage import StorageError

from .conftest import auth, make_business, make_user


def _jpeg() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (64, 40), (200, 190, 180)).save(buffer, format="JPEG")
    return buffer.getvalue()


PHOTO = _jpeg()


class FakeStorage:
    """In-memory stand-in so tests leave no files behind."""

    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}

    def put(self, path: str, data: bytes, content_type: str) -> None:
        self.files[path] = data

    def get(self, path: str) -> bytes:
        try:
            return self.files[path]
        except KeyError as exc:
            raise StorageError("Object not found") from exc

    def delete(self, path: str) -> None:
        self.files.pop(path, None)


@pytest.fixture(autouse=True)
def storage(monkeypatch) -> FakeStorage:
    fake = FakeStorage()
    for name in sample_client.SAMPLE_PHOTO_SOURCES:
        fake.files[f"{SAMPLE_PREFIX}/{name}"] = PHOTO
    monkeypatch.setattr(sample_client, "get_storage", lambda: fake)
    return fake


def _client_files(storage: FakeStorage) -> dict[str, bytes]:
    """Stored files other than the shared sample photos."""
    return {
        k: v
        for k, v in storage.files.items()
        if not k.startswith(f"{SAMPLE_PREFIX}/")
    }


def _designer(db):
    return make_user(db, business=make_business(db), role=UserRole.designer)


def _load(api, user):
    res = api.post("/api/v1/clients/sample", headers=auth(user))
    assert res.status_code == 201
    return res.json()


def test_sample_has_everything_a_real_client_has(api, db, storage):
    user = _designer(db)
    body = _load(api, user)
    cid = body["id"]
    assert body["is_sample"] is True
    assert body["assigned_designer_id"] == str(user.id)

    sources = [c.source for c in db.query(Checkpoint).filter_by(client_id=cid)]
    assert sources.count(CheckpointSource.ai_extract) == 2
    assert sources.count(CheckpointSource.manual) == 1

    designs = db.query(Design).filter_by(client_id=cid).all()
    assert len(designs) == 2
    hotspot_counts = sorted(
        db.query(DesignHotspot).filter_by(design_id=d.id).count()
        for d in designs
    )
    assert hotspot_counts == [0, 3]
    for d in designs:
        assert storage.get(d.storage_path)

    quotation = db.query(Quotation).filter_by(client_id=cid).one()
    versions = db.query(QuotationVersion).filter_by(quotation_id=quotation.id)
    assert versions.count() == 2
    assert db.query(ShareLink).filter_by(client_id=cid).count() == 1
    assert db.query(QuotationShare).count() == 1
    msgs = db.query(QuotationMessage).filter_by(quotation_id=quotation.id)
    assert msgs.count() == 2
    assert msgs.filter(QuotationMessage.resolved_at.is_(None)).count() == 1


def test_sample_screens_load(api, db):
    user = _designer(db)
    cid = _load(api, user)["id"]
    h = auth(user)
    assert (
        api.get(f"/api/v1/clients/{cid}/designs", headers=h).status_code == 200
    )
    assert (
        api.get(f"/api/v1/clients/{cid}/quotation", headers=h).status_code
        == 200
    )
    assert (
        api.get(f"/api/v1/clients/{cid}/quotation/versions", headers=h)
        .json()
        .__len__()
        == 2
    )
    assert (
        api.get(f"/api/v1/clients/{cid}/checkpoints", headers=h).status_code
        == 200
    )


def test_only_one_sample_at_a_time(api, db):
    user = _designer(db)
    _load(api, user)
    res = api.post("/api/v1/clients/sample", headers=auth(user))
    assert res.status_code == 409


def test_deleting_sample_removes_every_row_and_image(api, db, storage):
    user = _designer(db)
    cid = _load(api, user)["id"]
    paths = [d.storage_path for d in db.query(Design).filter_by(client_id=cid)]
    res = api.delete(f"/api/v1/clients/{cid}", headers=auth(user))
    assert res.status_code == 204
    db.expire_all()
    assert db.query(Client).filter_by(id=cid).count() == 0
    for model in (Checkpoint, Design, ShareLink, Quotation):
        assert db.query(model).filter_by(client_id=cid).count() == 0
    assert db.query(QuotationVersion).count() == 0
    assert db.query(QuotationShare).count() == 0
    assert db.query(QuotationMessage).count() == 0
    assert paths
    assert _client_files(storage) == {}


def test_real_clients_cannot_be_deleted(api, db):
    user = _designer(db)
    created = api.post(
        "/api/v1/clients", json={"name": "Real Client"}, headers=auth(user)
    )
    assert created.json()["is_sample"] is False
    res = api.delete(
        f"/api/v1/clients/{created.json()['id']}", headers=auth(user)
    )
    assert res.status_code == 403


def test_failed_image_upload_leaves_nothing_behind(
    api, db, storage, monkeypatch
):
    user = _designer(db)
    real_put = storage.put
    calls = []

    def flaky_put(path, data, content_type):
        calls.append(path)
        if len(calls) > 3:  # first photo and its copies succeed, then fail
            raise StorageError("down")
        real_put(path, data, content_type)

    monkeypatch.setattr(storage, "put", flaky_put)
    res = api.post("/api/v1/clients/sample", headers=auth(user))
    assert res.status_code == 502
    assert _client_files(storage) == {}
    assert db.query(Client).filter_by(is_sample=True).count() == 0


def test_missing_sample_photos_give_a_clear_error(api, db, storage):
    user = _designer(db)
    storage.files.clear()
    res = api.post("/api/v1/clients/sample", headers=auth(user))
    assert res.status_code == 502
    assert "missing" in res.json()["detail"]
    assert db.query(Client).filter_by(is_sample=True).count() == 0
