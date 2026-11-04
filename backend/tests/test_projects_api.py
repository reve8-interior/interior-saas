import io
import uuid

import pytest

from backend.core.config import settings
from backend.models.design import Design, DesignSource
from backend.models.project import Project
from backend.models.user import UserRole
from backend.services.storage import (
    StorageError,
    get_storage,
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

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture(autouse=True)
def _tmp_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "storage_local_dir", str(tmp_path))
    get_storage.cache_clear()
    yield
    get_storage.cache_clear()


def _setup(db, plan="solo", **kw):
    biz = make_business(db, plan=plan, **kw)
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    return biz, user


def _design(db, biz, client=None, **kw):
    design = Design(
        id=uuid.uuid4(),
        business_id=biz.id,
        client_id=client.id if client else None,
        source=DesignSource.designer_uploaded,
        image_url="https://example.com/x.png",
        specs_json={},
        **kw,
    )
    db.add(design)
    db.flush()
    return design


def _create(api, user, title="Villa"):
    r = api.post("/api/v1/projects", headers=auth(user), json={"title": title})
    assert r.status_code == 201, r.text
    return r.json()


def _upload(api, user, project_id):
    return api.post(
        f"/api/v1/projects/{project_id}/upload",
        headers=auth(user),
        files={"file": ("a.png", io.BytesIO(PNG), "image/png")},
    )


def test_crud(api, db):
    _, user = _setup(db)
    p = _create(api, user)
    assert p["designs"] == [] and p["position"] == 0
    r = api.patch(
        f"/api/v1/projects/{p['id']}",
        headers=auth(user),
        json={"title": " Loft ", "year": 2024, "location": "Pune"},
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Loft" and r.json()["year"] == 2024
    listed = api.get("/api/v1/projects", headers=auth(user)).json()
    assert [x["id"] for x in listed] == [p["id"]]
    assert (
        api.delete(
            f"/api/v1/projects/{p['id']}", headers=auth(user)
        ).status_code
        == 204
    )
    assert api.get("/api/v1/projects", headers=auth(user)).json() == []


def test_create_validation(api, db):
    _, user = _setup(db)
    for body in ({"title": ""}, {"title": "  "}, {}, {"title": "a", "x": 1}):
        r = api.post("/api/v1/projects", headers=auth(user), json=body)
        assert r.status_code == 422


def test_free_plan_403(api, db):
    _, user = _setup(db, plan="free")
    assert api.get("/api/v1/projects", headers=auth(user)).status_code == 200
    r = api.post("/api/v1/projects", headers=auth(user), json={"title": "x"})
    assert r.status_code == 403


def test_other_business_project_404(api, db):
    biz, user = _setup(db)
    p = _create(api, user)
    as_owner(db)
    _, other = _setup(db)
    r = api.patch(
        f"/api/v1/projects/{p['id']}", headers=auth(other), json={"title": "z"}
    )
    assert r.status_code == 404


def test_attach_and_order_by_position(api, db):
    biz, user = _setup(db)
    p = _create(api, user)
    a, b = _design(db, biz), _design(db, biz)
    r = api.post(
        f"/api/v1/projects/{p['id']}/designs",
        headers=auth(user),
        json={"design_ids": [str(b.id), str(a.id)]},
    )
    assert r.status_code == 200
    assert [d["id"] for d in r.json()["designs"]] == [str(b.id), str(a.id)]


def test_attach_other_business_design_404(api, db):
    biz, user = _setup(db)
    p = _create(api, user)
    as_owner(db)
    other_biz = make_business(db, plan="solo")
    as_business(db, other_biz.id)
    foreign = _design(db, other_biz)
    as_business(db, biz.id)
    r = api.post(
        f"/api/v1/projects/{p['id']}/designs",
        headers=auth(user),
        json={"design_ids": [str(foreign.id)]},
    )
    assert r.status_code == 404
    r = api.post(
        f"/api/v1/projects/{p['id']}/designs",
        headers=auth(user),
        json={"design_ids": [str(uuid.uuid4())]},
    )
    assert r.status_code == 404


def test_design_in_one_project_only(api, db):
    biz, user = _setup(db)
    p1, p2 = _create(api, user, "One"), _create(api, user, "Two")
    d = _design(db, biz)
    for p in (p1, p2):
        api.post(
            f"/api/v1/projects/{p['id']}/designs",
            headers=auth(user),
            json={"design_ids": [str(d.id)]},
        )
    listed = {
        x["id"]: x
        for x in api.get("/api/v1/projects", headers=auth(user)).json()
    }
    assert listed[p1["id"]]["designs"] == []
    assert [x["id"] for x in listed[p2["id"]]["designs"]] == [str(d.id)]


def test_reorder(api, db):
    biz, user = _setup(db)
    p1, p2 = _create(api, user, "One"), _create(api, user, "Two")
    r = api.put(
        "/api/v1/projects/order",
        headers=auth(user),
        json={"ids": [p2["id"], p1["id"]]},
    )
    assert r.status_code == 204
    listed = api.get("/api/v1/projects", headers=auth(user)).json()
    assert [x["id"] for x in listed] == [p2["id"], p1["id"]]
    bad = api.put(
        "/api/v1/projects/order",
        headers=auth(user),
        json={"ids": [str(uuid.uuid4())]},
    )
    assert bad.status_code == 404

    a, b = _design(db, biz), _design(db, biz)
    api.post(
        f"/api/v1/projects/{p1['id']}/designs",
        headers=auth(user),
        json={"design_ids": [str(a.id), str(b.id)]},
    )
    r = api.put(
        f"/api/v1/projects/{p1['id']}/designs/order",
        headers=auth(user),
        json={"design_ids": [str(b.id), str(a.id)]},
    )
    assert r.status_code == 204
    got = api.get("/api/v1/projects", headers=auth(user)).json()
    mine = next(x for x in got if x["id"] == p1["id"])
    assert [d["id"] for d in mine["designs"]] == [str(b.id), str(a.id)]


def test_cover_must_belong_to_project(api, db):
    biz, user = _setup(db)
    p1, p2 = _create(api, user, "One"), _create(api, user, "Two")
    d = _design(db, biz)
    api.post(
        f"/api/v1/projects/{p1['id']}/designs",
        headers=auth(user),
        json={"design_ids": [str(d.id)]},
    )
    bad = api.patch(
        f"/api/v1/projects/{p2['id']}",
        headers=auth(user),
        json={"cover_design_id": str(d.id)},
    )
    assert bad.status_code == 422
    ok = api.patch(
        f"/api/v1/projects/{p1['id']}",
        headers=auth(user),
        json={"cover_design_id": str(d.id)},
    )
    assert ok.status_code == 200 and ok.json()["cover_design_id"] == str(d.id)
    cleared = api.patch(
        f"/api/v1/projects/{p1['id']}",
        headers=auth(user),
        json={"cover_design_id": None},
    )
    assert cleared.json()["cover_design_id"] is None


def test_upload_creates_clientless_design(api, db):
    biz, user = _setup(db)
    p = _create(api, user)
    r = _upload(api, user, p["id"])
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["client_id"] is None and body["position"] == 0
    design = db.get(Design, uuid.UUID(body["id"]))
    assert design.business_id == biz.id and design.client_id is None
    assert design.source == DesignSource.designer_uploaded
    assert design.storage_path == f"designs/{biz.id}/{design.id}.png"
    assert get_storage().get(design.storage_path) == PNG
    assert _upload(api, user, p["id"]).json()["position"] == 1


def test_upload_counts_toward_image_limit(api, db):
    _, user = _setup(db, max_images=1)
    p = _create(api, user)
    assert _upload(api, user, p["id"]).status_code == 201
    r = _upload(api, user, p["id"])
    assert r.status_code == 403
    assert "limit" in r.json()["detail"].lower()


def test_upload_rejects_non_image(api, db):
    _, user = _setup(db)
    p = _create(api, user)
    r = api.post(
        f"/api/v1/projects/{p['id']}/upload",
        headers=auth(user),
        files={"file": ("a.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert r.status_code == 415


def test_detach_deletes_clientless_design(api, db):
    _, user = _setup(db, max_images=1)
    p = _create(api, user)
    design_id = _upload(api, user, p["id"]).json()["id"]
    path = db.get(Design, uuid.UUID(design_id)).storage_path
    storage = get_storage()
    assert storage.get(path)
    r = api.delete(
        f"/api/v1/projects/{p['id']}/designs/{design_id}", headers=auth(user)
    )
    assert r.status_code == 204
    db.expire_all()
    assert db.get(Design, uuid.UUID(design_id)) is None
    with pytest.raises(StorageError):
        storage.get(path)
    # The slot is free again.
    assert _upload(api, user, p["id"]).status_code == 201


def test_detach_client_design_keeps_it(api, db):
    biz, user = _setup(db)
    client = make_client_row(db, assigned_designer_id=user.id)
    d = _design(db, biz, client)
    p = _create(api, user)
    api.post(
        f"/api/v1/projects/{p['id']}/designs",
        headers=auth(user),
        json={"design_ids": [str(d.id)]},
    )
    r = api.delete(
        f"/api/v1/projects/{p['id']}/designs/{d.id}", headers=auth(user)
    )
    assert r.status_code == 204
    db.expire_all()
    kept = db.get(Design, d.id)
    assert kept is not None
    assert kept.project_id is None and kept.project_position is None
    again = api.delete(
        f"/api/v1/projects/{p['id']}/designs/{d.id}", headers=auth(user)
    )
    assert again.status_code == 404


def test_delete_project_keeps_client_designs_drops_clientless(api, db):
    biz, user = _setup(db)
    client = make_client_row(db, assigned_designer_id=user.id)
    d = _design(db, biz, client)
    p = _create(api, user)
    api.post(
        f"/api/v1/projects/{p['id']}/designs",
        headers=auth(user),
        json={"design_ids": [str(d.id)]},
    )
    orphan_id = _upload(api, user, p["id"]).json()["id"]
    assert (
        api.delete(
            f"/api/v1/projects/{p['id']}", headers=auth(user)
        ).status_code
        == 204
    )
    db.expire_all()
    assert db.get(Design, d.id) is not None
    assert db.get(Design, uuid.UUID(orphan_id)) is None


def test_project_with_zero_designs_reads_fine(api, db):
    _, user = _setup(db)
    p = _create(api, user)
    got = api.get("/api/v1/projects", headers=auth(user)).json()
    assert got[0]["id"] == p["id"] and got[0]["designs"] == []
    r = api.patch(
        f"/api/v1/projects/{p['id']}", headers=auth(user), json={"story": "s"}
    )
    assert r.status_code == 200 and r.json()["designs"] == []


def _attach(api, user, project_id, design_id):
    return api.post(
        f"/api/v1/projects/{project_id}/designs",
        headers=auth(user),
        json={"design_ids": [str(design_id)]},
    )


def _cover(api, user, project_id, design_id):
    r = api.patch(
        f"/api/v1/projects/{project_id}",
        headers=auth(user),
        json={"cover_design_id": str(design_id)},
    )
    assert r.status_code == 200, r.text


def _covers(api, user):
    got = api.get("/api/v1/projects", headers=auth(user)).json()
    return {x["id"]: x["cover_design_id"] for x in got}


def test_detach_cover_design_clears_cover(api, db):
    biz, user = _setup(db)
    client = make_client_row(db, assigned_designer_id=user.id)
    d = _design(db, biz, client)
    p = _create(api, user)
    _attach(api, user, p["id"], d.id)
    _cover(api, user, p["id"], d.id)
    r = api.delete(
        f"/api/v1/projects/{p['id']}/designs/{d.id}", headers=auth(user)
    )
    assert r.status_code == 204
    assert _covers(api, user)[p["id"]] is None


def test_move_cover_design_clears_old_cover_only(api, db):
    biz, user = _setup(db)
    client = make_client_row(db, assigned_designer_id=user.id)
    d = _design(db, biz, client)
    p1, p2 = _create(api, user, "One"), _create(api, user, "Two")
    _attach(api, user, p1["id"], d.id)
    _cover(api, user, p1["id"], d.id)
    assert _attach(api, user, p2["id"], d.id).status_code == 200
    covers = _covers(api, user)
    assert covers[p1["id"]] is None
    assert covers[p2["id"]] is None
    # Re-attaching within the same project keeps its cover.
    _cover(api, user, p2["id"], d.id)
    _attach(api, user, p2["id"], d.id)
    assert _covers(api, user)[p2["id"]] == str(d.id)


def test_delete_project_removes_storage_objects(api, db):
    biz, user = _setup(db)
    client = make_client_row(db, assigned_designer_id=user.id)
    kept = _design(db, biz, client)
    p = _create(api, user)
    _attach(api, user, p["id"], kept.id)
    orphan_id = _upload(api, user, p["id"]).json()["id"]
    path = db.get(Design, uuid.UUID(orphan_id)).storage_path
    storage = get_storage()
    assert storage.get(path)
    api.delete(f"/api/v1/projects/{p['id']}", headers=auth(user))
    for obj in (path, thumb_path(path), view_path(path)):
        with pytest.raises(StorageError):
            storage.get(obj)
    db.expire_all()
    assert db.get(Design, kept.id) is not None


def test_downgraded_business_can_list_delete_detach_not_create(api, db):
    from backend.services.image_quota import uploaded_image_count

    biz, user = _setup(db, max_images=5)
    p1, p2 = _create(api, user, "A"), _create(api, user, "B")
    d1 = _upload(api, user, p1["id"]).json()["id"]
    d2 = _upload(api, user, p2["id"]).json()["id"]
    paths = [db.get(Design, uuid.UUID(i)).storage_path for i in (d1, d2)]
    biz.plan = "free"
    db.flush()
    h = auth(user)

    listed = api.get("/api/v1/projects", headers=h)
    assert listed.status_code == 200 and len(listed.json()) == 2
    assert uploaded_image_count(biz.id, db) == 2

    r = api.delete(f"/api/v1/projects/{p1['id']}/designs/{d1}", headers=h)
    assert r.status_code == 204
    db.expire_all()
    assert uploaded_image_count(biz.id, db) == 1
    storage = get_storage()
    for obj in (paths[0], thumb_path(paths[0]), view_path(paths[0])):
        with pytest.raises(StorageError):
            storage.get(obj)

    assert (
        api.delete(f"/api/v1/projects/{p2['id']}", headers=h).status_code
        == 204
    )
    db.expire_all()
    assert uploaded_image_count(biz.id, db) == 0
    with pytest.raises(StorageError):
        storage.get(paths[1])

    assert (
        api.post(
            "/api/v1/projects", headers=h, json={"title": "x"}
        ).status_code
        == 403
    )
    assert _upload(api, user, p1["id"]).status_code == 403
    assert (
        api.post(
            f"/api/v1/projects/{p1['id']}/designs",
            headers=h,
            json={"design_ids": []},
        ).status_code
        == 403
    )
    assert api.get("/api/v1/projects/library", headers=h).status_code == 403
    assert (
        api.put(
            "/api/v1/projects/order", headers=h, json={"ids": []}
        ).status_code
        == 403
    )
    assert (
        api.patch(
            f"/api/v1/projects/{p1['id']}", headers=h, json={"title": "z"}
        ).status_code
        == 403
    )


def test_upload_sets_project_on_creation(api, db):
    _, user = _setup(db)
    p = _create(api, user)
    design_id = _upload(api, user, p["id"]).json()["id"]
    db.expire_all()
    d = db.get(Design, uuid.UUID(design_id))
    assert d.project_id == uuid.UUID(p["id"]) and d.project_position == 0


def test_store_design_image_single_commit_with_project(db, monkeypatch):
    from starlette.datastructures import UploadFile

    from backend.services import design_images

    biz = make_business(db, plan="solo")
    as_business(db, biz.id)
    project = Project(business_id=biz.id, title="P", position=0)
    db.add(project)
    db.flush()
    commits: list[int] = []
    real = db.commit
    monkeypatch.setattr(db, "commit", lambda: (commits.append(1), real())[1])
    design = design_images.store_design_image(
        db,
        biz,
        None,
        UploadFile(io.BytesIO(PNG), filename="a.png"),
        None,
        None,
        project_id=project.id,
        project_position=3,
    )
    assert len(commits) == 1
    assert design.project_id == project.id and design.project_position == 3
