"""A floor plan is kept with the meeting it drafted and counts as an image."""

import io
import uuid
from unittest.mock import AsyncMock, patch
from urllib.parse import urlparse

import pytest
from fastapi import HTTPException
from PIL import Image

from backend.agents.floorplan_agent import FloorPlanExtraction, FloorPlanRoom
from backend.core.config import settings
from backend.models.checkpoint import Checkpoint, CheckpointSource
from backend.models.client import Client
from backend.models.design import Design, DesignSource
from backend.models.user import UserRole
from backend.schemas.checkpoint import CheckpointRead
from backend.services import floorplan_storage, sample_client
from backend.services.floorplan_storage import (
    delete_floorplan_image,
    store_floorplan_image,
    validate_floorplan_path,
)
from backend.services.image_quota import (
    ensure_can_upload,
    uploaded_image_count,
)
from backend.services.plan_limits import usage_summary
from backend.services.secret_box import encrypt_secret
from backend.services.storage import (
    StorageError,
    get_storage,
    signed_media_url,
    signed_view_url,
    thumb_path,
    view_path,
)

from .conftest import (
    as_business,
    as_owner,
    auth,
    make_business,
    make_client_row,
    make_user,
)

AGENT = "backend.services.floorplan_extraction.run_floorplan_extraction"
CLIENT_ID = "11111111-1111-1111-1111-111111111111"
PLAN_ID = "22222222-2222-2222-2222-222222222222"


def _image(fmt: str = "PNG", size: tuple[int, int] = (64, 48)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, "white").save(out, fmt)
    return out.getvalue()


PNG = _image("PNG")
JPG = _image("JPEG")
HALL = FloorPlanExtraction(
    rooms=[FloorPlanRoom(name="Hall", length_ft=15, width_ft=12)]
)


@pytest.fixture(autouse=True)
def _tmp_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "storage_local_dir", str(tmp_path))
    get_storage.cache_clear()
    yield
    get_storage.cache_clear()


def _stored() -> list[str]:
    """Every key currently in storage."""
    base = get_storage()._base
    return sorted(
        p.relative_to(base).as_posix() for p in base.rglob("*") if p.is_file()
    )


def _setup(db, **biz_kw):
    biz = make_business(
        db,
        openai_api_key_enc=encrypt_secret("sk-" + "t" * 30),
        **biz_kw,
    )
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    return biz, user, make_client_row(db, "C")


def _extract(api, user, client, content=PNG, name="plan.png"):
    return api.post(
        f"/api/v1/clients/{client.id}/quotation/floor-plan/extract",
        headers=auth(user),
        files={"file": (name, io.BytesIO(content), "image/png")},
    )


def _extract_ok(api, user, client, content=PNG) -> str:
    with patch(AGENT, AsyncMock(return_value=(HALL, 100, 20))):
        r = _extract(api, user, client, content)
    assert r.status_code == 200, r.text
    return r.json()["source_image_path"]


def _save(api, user, client, path):
    return api.post(
        f"/api/v1/clients/{client.id}/checkpoints/from-extraction",
        headers=auth(user),
        json={
            "summary_text": "Draft",
            "raw_transcript": "Draft",
            "line_items": [],
            "allow_incomplete": True,
            "source_image_path": path,
        },
    )


def _meetings(api, user, client) -> list[dict]:
    r = api.get(f"/api/v1/clients/{client.id}/checkpoints", headers=auth(user))
    assert r.status_code == 200, r.text
    return r.json()


def _add_checkpoint(db, client, path=None, added=False) -> Checkpoint:
    cp = Checkpoint(
        client_id=client.id,
        summary_text="s",
        source=CheckpointSource.ai_extract,
        source_image_path=path,
        added_to_quotation=added,
    )
    db.add(cp)
    db.flush()
    return cp


def _add_design(db, client) -> None:
    db.add(
        Design(
            id=uuid.uuid4(),
            business_id=client.business_id,
            client_id=client.id,
            source=DesignSource.designer_uploaded,
            storage_path=f"designs/{client.id}/{uuid.uuid4()}.png",
        )
    )
    db.flush()


# ── validate_floorplan_path ──────────────────────────────────────────────


def test_no_path_is_accepted_as_none():
    assert validate_floorplan_path(None, CLIENT_ID) is None


@pytest.mark.parametrize("ext", ["jpg", "png", "webp"])
def test_path_issued_for_the_client_is_accepted(ext):
    path = f"floorplans/{CLIENT_ID}/{PLAN_ID}.{ext}"
    assert validate_floorplan_path(path, CLIENT_ID) == path


@pytest.mark.parametrize(
    "path",
    [
        "",
        f"floorplans/{PLAN_ID}/{PLAN_ID}.png",  # another client's folder
        f"floorplans/{CLIENT_ID}/{PLAN_ID}.gif",  # extension not stored
        f"floorplans/{CLIENT_ID}/{PLAN_ID}.png.exe",
        f"designs/{CLIENT_ID}/{PLAN_ID}.png",  # a design, not a plan
        f"floorplans/{CLIENT_ID}/../{CLIENT_ID}/{PLAN_ID}.png",
        f"floorplans/{CLIENT_ID}/{PLAN_ID}.png/extra",
        f"/floorplans/{CLIENT_ID}/{PLAN_ID}.png",
        f"floorplans/{CLIENT_ID}/not-a-uuid.png",
        f"floorplans/{CLIENT_ID}/{PLAN_ID}.png\n",
        f"floorplans/{CLIENT_ID}/{PLAN_ID}.thumb.jpg",
    ],
)
def test_path_not_issued_for_the_client_is_rejected(path):
    with pytest.raises(HTTPException) as exc:
        validate_floorplan_path(path, CLIENT_ID)
    assert exc.value.status_code == 422


# ── store / delete ───────────────────────────────────────────────────────


def test_store_writes_the_original_and_both_derived_sizes():
    path = store_floorplan_image(CLIENT_ID, PNG, "png")
    assert path.startswith(f"floorplans/{CLIENT_ID}/")
    assert path.endswith(".png")
    assert _stored() == sorted([path, thumb_path(path), view_path(path)])
    assert get_storage().get(path) == PNG


def test_store_keeps_the_given_extension():
    path = store_floorplan_image(CLIENT_ID, JPG, "jpg")
    assert path.endswith(".jpg")
    assert get_storage().get(path) == JPG


def test_two_stores_never_share_a_key():
    a = store_floorplan_image(CLIENT_ID, PNG, "png")
    b = store_floorplan_image(CLIENT_ID, PNG, "png")
    assert a != b


def test_stored_key_passes_its_own_validation():
    path = store_floorplan_image(CLIENT_ID, PNG, "png")
    assert validate_floorplan_path(path, CLIENT_ID) == path


def test_undecodable_image_still_stores_the_original():
    # Derived sizes are best effort; the original is what matters.
    path = store_floorplan_image(
        CLIENT_ID, b"\x89PNG\r\n\x1a\n" + b"0" * 8, "png"
    )
    assert get_storage().get(path).startswith(b"\x89PNG")


def test_storage_failure_is_a_generic_502(monkeypatch):
    class Broken:
        def put(self, *a, **kw):
            raise StorageError("secret bucket detail")

    monkeypatch.setattr(floorplan_storage, "get_storage", lambda: Broken())
    with pytest.raises(HTTPException) as exc:
        store_floorplan_image(CLIENT_ID, PNG, "png")
    assert exc.value.status_code == 502
    assert "secret" not in exc.value.detail


def test_delete_removes_the_original_and_derived_sizes():
    keep = store_floorplan_image(CLIENT_ID, PNG, "png")
    gone = store_floorplan_image(CLIENT_ID, PNG, "png")
    delete_floorplan_image(gone)
    assert _stored() == sorted([keep, thumb_path(keep), view_path(keep)])


def test_delete_of_nothing_is_a_no_op():
    delete_floorplan_image(None)
    delete_floorplan_image("")
    delete_floorplan_image(f"floorplans/{CLIENT_ID}/{PLAN_ID}.png")


# ── image allowance ──────────────────────────────────────────────────────


def test_count_adds_designs_and_floor_plans(db):
    _, _, client = _setup(db)
    _add_design(db, client)
    _add_checkpoint(db, client, f"floorplans/{client.id}/{PLAN_ID}.png")
    _add_checkpoint(db, client, f"floorplans/{client.id}/{CLIENT_ID}.png")
    assert uploaded_image_count(client.business_id, db) == 3


def test_meeting_without_a_plan_does_not_count(db):
    _, _, client = _setup(db)
    _add_checkpoint(db, client, None)
    assert uploaded_image_count(client.business_id, db) == 0


def test_applied_meeting_still_counts_its_plan(db):
    _, _, client = _setup(db)
    _add_checkpoint(db, client, f"floorplans/{client.id}/{PLAN_ID}.png", True)
    assert uploaded_image_count(client.business_id, db) == 1


def test_count_is_per_business(db):
    as_owner(db)
    a, b = make_business(db), make_business(db)
    client_a = make_client_row(db, business_id=a.id)
    client_b = make_client_row(db, business_id=b.id)
    _add_checkpoint(db, client_a, f"floorplans/{client_a.id}/{PLAN_ID}.png")
    _add_checkpoint(db, client_b, f"floorplans/{client_b.id}/{PLAN_ID}.png")
    _add_checkpoint(db, client_b, f"floorplans/{client_b.id}/{CLIENT_ID}.png")
    assert uploaded_image_count(a.id, db) == 1
    assert uploaded_image_count(b.id, db) == 2


def test_floor_plans_fill_the_allowance_for_design_uploads(db):
    biz, _, client = _setup(db, max_images=1)
    ensure_can_upload(biz, db)
    _add_checkpoint(db, client, f"floorplans/{client.id}/{PLAN_ID}.png")
    with pytest.raises(HTTPException) as exc:
        ensure_can_upload(biz, db)
    assert exc.value.status_code == 403


def test_design_uploads_fill_the_allowance_for_floor_plans(api, db):
    _, user, client = _setup(db, max_images=1)
    _add_design(db, client)
    with patch(AGENT, AsyncMock()) as agent:
        r = _extract(api, user, client)
    assert r.status_code == 403
    assert "limit" in r.json()["detail"].lower()
    agent.assert_not_called()
    assert _stored() == []


def test_usage_meter_includes_floor_plans(db):
    biz, _, client = _setup(db)
    _add_design(db, client)
    _add_checkpoint(db, client, f"floorplans/{client.id}/{PLAN_ID}.png")
    meter = next(m for m in usage_summary(db, biz) if m.key == "images")
    assert meter.used == 2


# ── extract ──────────────────────────────────────────────────────────────


def test_extract_stores_the_plan_and_returns_its_key(api, db):
    _, user, client = _setup(db)
    path = _extract_ok(api, user, client)
    assert path.startswith(f"floorplans/{client.id}/")
    assert get_storage().get(path) == PNG
    assert thumb_path(path) in _stored()
    assert view_path(path) in _stored()


def test_extract_accepts_jpeg(api, db):
    _, user, client = _setup(db)
    path = _extract_ok(api, user, client, JPG)
    assert path.endswith(".jpg")


def test_extract_alone_does_not_count_against_the_allowance(api, db):
    biz, user, client = _setup(db)
    _extract_ok(api, user, client)
    assert uploaded_image_count(biz.id, db) == 0


@pytest.mark.parametrize(
    ("agent", "status"),
    [
        (
            AsyncMock(
                return_value=(
                    FloorPlanExtraction(rooms=[], unreadable=True),
                    1,
                    1,
                )
            ),
            422,
        ),
        (AsyncMock(side_effect=RuntimeError("sk-secret boom")), 502),
    ],
)
def test_a_plan_that_cannot_be_read_is_not_stored(api, db, agent, status):
    _, user, client = _setup(db)
    with patch(AGENT, agent):
        r = _extract(api, user, client)
    assert r.status_code == status
    assert _stored() == []


def test_non_image_is_not_stored_or_read(api, db):
    _, user, client = _setup(db)
    with patch(AGENT, AsyncMock()) as agent:
        r = _extract(api, user, client, b"not an image")
    assert r.status_code == 415
    agent.assert_not_called()
    assert _stored() == []


def test_oversized_plan_is_413_under_the_business_cap(api, db):
    _, user, client = _setup(db, max_image_mb=1)
    big = PNG + b"\x00" * (1024 * 1024)
    with patch(AGENT, AsyncMock()) as agent:
        r = _extract(api, user, client, big)
    assert r.status_code == 413
    assert "1 MB" in r.json()["detail"]
    agent.assert_not_called()
    assert _stored() == []


def test_plan_just_under_the_cap_is_accepted(api, db):
    _, user, client = _setup(db, max_image_mb=1)
    ok = PNG + b"\x00" * (1024 * 1024 - len(PNG))
    assert len(ok) == 1024 * 1024
    _extract_ok(api, user, client, ok)


def test_storage_outage_after_reading_is_a_502(api, db, monkeypatch):
    _, user, client = _setup(db)

    class Broken:
        def put(self, *a, **kw):
            raise StorageError("down")

    monkeypatch.setattr(floorplan_storage, "get_storage", lambda: Broken())
    with patch(AGENT, AsyncMock(return_value=(HALL, 1, 1))):
        r = _extract(api, user, client)
    assert r.status_code == 502
    assert "down" not in r.text


def test_extract_for_an_unknown_client_is_404(api, db):
    _, user, _ = _setup(db)
    ghost = Client(id=uuid.uuid4(), name="x", contact_info={})
    with patch(AGENT, AsyncMock()) as agent:
        r = _extract(api, user, ghost)
    assert r.status_code == 404
    agent.assert_not_called()
    assert _stored() == []


# ── saving the meeting ───────────────────────────────────────────────────


def test_saved_meeting_keeps_the_plan_and_counts(api, db):
    biz, user, client = _setup(db)
    path = _extract_ok(api, user, client)
    assert _save(api, user, client, path).status_code == 201
    [meeting] = _meetings(api, user, client)
    assert meeting["source_image_url"]
    assert uploaded_image_count(biz.id, db) == 1


def test_meeting_without_a_plan_has_no_image(api, db):
    biz, user, client = _setup(db)
    assert _save(api, user, client, None).status_code == 201
    [meeting] = _meetings(api, user, client)
    assert meeting["source_image_url"] is None
    assert uploaded_image_count(biz.id, db) == 0


def test_raw_storage_key_is_never_returned(api, db):
    _, user, client = _setup(db)
    path = _extract_ok(api, user, client)
    _save(api, user, client, path)
    [meeting] = _meetings(api, user, client)
    assert "source_image_path" not in meeting
    assert path not in str(meeting)


@pytest.mark.parametrize(
    "path",
    [
        f"floorplans/{uuid.uuid4()}/{uuid.uuid4()}.png",
        "floorplans/x/y.png",
        "../../etc/passwd",
        "designs/some/other.png",
    ],
)
def test_foreign_or_malformed_path_is_rejected_and_saves_nothing(
    api, db, path
):
    _, user, client = _setup(db)
    assert _save(api, user, client, path).status_code == 422
    assert _meetings(api, user, client) == []


def test_each_meeting_keeps_its_own_plan(api, db):
    biz, user, client = _setup(db)
    first = _extract_ok(api, user, client)
    second = _extract_ok(api, user, client, JPG)
    _save(api, user, client, first)
    _save(api, user, client, second)
    urls = [m["source_image_url"] for m in _meetings(api, user, client)]
    assert len(set(urls)) == 2
    assert uploaded_image_count(biz.id, db) == 2


def test_read_schema_signs_the_view_image_and_hides_the_key():
    path = f"floorplans/{CLIENT_ID}/{PLAN_ID}.png"
    read = CheckpointRead.model_validate(
        {
            "id": uuid.uuid4(),
            "client_id": uuid.uuid4(),
            "summary_text": "s",
            "structured_diff": {},
            "status": "draft",
            "source": "ai_extract",
            "raw_conversation": None,
            "audio_transcript": None,
            "added_to_quotation": False,
            "created_at": "2026-11-08T00:00:00Z",
            "source_image_path": path,
        }
    )
    dumped = read.model_dump()
    assert "source_image_path" not in dumped
    assert view_path(path) in dumped["source_image_url"]
    assert dumped["source_image_url"].startswith(
        signed_view_url(path).split("?")[0]
    )


def test_read_schema_without_a_plan_has_no_url():
    read = CheckpointRead.model_validate(
        {
            "id": uuid.uuid4(),
            "client_id": uuid.uuid4(),
            "summary_text": "s",
            "structured_diff": {},
            "status": "draft",
            "source": "manual",
            "raw_conversation": None,
            "audio_transcript": None,
            "added_to_quotation": False,
            "created_at": "2026-11-08T00:00:00Z",
        }
    )
    assert read.model_dump()["source_image_url"] is None


# ── viewing it ───────────────────────────────────────────────────────────


def _fetch(api, url: str):
    return api.get(url[url.index("/api/") :])


def test_saved_plan_is_served_through_its_signed_link(api, db):
    _, user, client = _setup(db)
    path = _extract_ok(api, user, client)
    _save(api, user, client, path)
    [meeting] = _meetings(api, user, client)
    r = _fetch(api, meeting["source_image_url"])
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/webp"
    assert r.headers["x-content-type-options"] == "nosniff"
    assert Image.open(io.BytesIO(r.content)).format == "WEBP"


def test_original_plan_is_served_to_a_signed_link(api, db):
    _, user, client = _setup(db)
    path = _extract_ok(api, user, client)
    r = _fetch(api, signed_media_url(path))
    assert r.status_code == 200
    assert r.content == PNG


def test_plan_link_with_a_tampered_signature_is_404(api, db):
    _, user, client = _setup(db)
    path = _extract_ok(api, user, client)
    url = signed_view_url(path)
    assert _fetch(api, url[:-4] + "0000").status_code == 404


def test_plan_link_cannot_be_reused_for_another_object(api, db):
    _, user, client = _setup(db)
    path = _extract_ok(api, user, client)
    other = _extract_ok(api, user, client)
    parsed = urlparse(signed_view_url(path))
    swapped = f"/api/v1/media/{view_path(other)}?{parsed.query}"
    assert api.get(swapped).status_code == 404


def test_unsigned_plan_request_is_rejected(api, db):
    _, user, client = _setup(db)
    path = _extract_ok(api, user, client)
    assert api.get(f"/api/v1/media/{path}").status_code == 422


def test_only_known_prefixes_are_served(api):
    get_storage().put("secrets/a.png", PNG, "image/png")
    assert _fetch(api, signed_media_url("secrets/a.png")).status_code == 404


# ── deleting a meeting ───────────────────────────────────────────────────


def test_deleting_a_draft_meeting_removes_its_plan_and_the_count(api, db):
    biz, user, client = _setup(db)
    path = _extract_ok(api, user, client)
    _save(api, user, client, path)
    [meeting] = _meetings(api, user, client)
    r = api.delete(f"/api/v1/checkpoints/{meeting['id']}", headers=auth(user))
    assert r.status_code == 204
    assert _stored() == []
    assert uploaded_image_count(biz.id, db) == 0


def test_deleting_one_meeting_leaves_the_other_plan(api, db):
    _, user, client = _setup(db)
    first = _extract_ok(api, user, client)
    second = _extract_ok(api, user, client)
    _save(api, user, client, first)
    _save(api, user, client, second)
    meetings = _meetings(api, user, client)
    api.delete(f"/api/v1/checkpoints/{meetings[0]['id']}", headers=auth(user))
    assert get_storage().get(second) == PNG
    assert first not in _stored()


def test_deleting_a_meeting_without_a_plan_works(api, db):
    _, user, client = _setup(db)
    _save(api, user, client, None)
    [meeting] = _meetings(api, user, client)
    r = api.delete(f"/api/v1/checkpoints/{meeting['id']}", headers=auth(user))
    assert r.status_code == 204


def test_meeting_already_on_the_quotation_keeps_its_plan(api, db):
    _, user, client = _setup(db)
    path = _extract_ok(api, user, client)
    cp = _add_checkpoint(db, client, path, added=True)
    r = api.delete(f"/api/v1/checkpoints/{cp.id}", headers=auth(user))
    assert r.status_code == 409
    assert get_storage().get(path) == PNG


def test_storage_failure_on_delete_does_not_fail_the_request(
    api, db, monkeypatch
):
    biz, user, client = _setup(db)
    path = _extract_ok(api, user, client)
    _save(api, user, client, path)
    [meeting] = _meetings(api, user, client)

    class Broken:
        def delete(self, *a, **kw):
            raise StorageError("down")

    monkeypatch.setattr(
        "backend.services.design_images.get_storage", lambda: Broken()
    )
    r = api.delete(f"/api/v1/checkpoints/{meeting['id']}", headers=auth(user))
    assert r.status_code == 204
    assert uploaded_image_count(biz.id, db) == 0


# ── sample client cleanup ────────────────────────────────────────────────


def test_image_paths_lists_designs_and_floor_plans(db):
    _, _, client = _setup(db)
    _add_design(db, client)
    plan = f"floorplans/{client.id}/{PLAN_ID}.png"
    _add_checkpoint(db, client, plan)
    _add_checkpoint(db, client, None)
    paths = sample_client.image_paths(db, client.id)
    assert plan in paths
    assert len(paths) == 2
    assert all(paths)


def test_image_paths_leaves_other_clients_out(db):
    _, _, client = _setup(db)
    other = make_client_row(db, "Other")
    _add_checkpoint(db, other, f"floorplans/{other.id}/{PLAN_ID}.png")
    assert sample_client.image_paths(db, client.id) == []


def test_image_paths_is_empty_for_a_client_with_nothing(db):
    _, _, client = _setup(db)
    assert sample_client.image_paths(db, client.id) == []


def test_deleting_the_sample_client_removes_its_floor_plans(api, db):
    _, user, _ = _setup(db)
    sample = make_client_row(db, "Sample", is_sample=True)
    real = make_client_row(db, "Real")
    sample_plan = store_floorplan_image(str(sample.id), PNG, "png")
    real_plan = store_floorplan_image(str(real.id), PNG, "png")
    _add_checkpoint(db, sample, sample_plan)
    _add_checkpoint(db, real, real_plan)

    r = api.delete(f"/api/v1/clients/{sample.id}", headers=auth(user))
    assert r.status_code == 204
    left = _stored()
    assert sample_plan not in left
    assert thumb_path(sample_plan) not in left
    assert view_path(sample_plan) not in left
    assert real_plan in left
