"""Designs carry their own business_id, so they can exist without a client."""

import io

import pytest
from sqlalchemy import select

from backend.core.config import settings
from backend.models.design import Design, DesignSource
from backend.services import image_quota, plan_limits
from backend.services.storage import get_storage

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


def _clientless(db, business_id, **kw) -> Design:
    design = Design(
        business_id=business_id,
        client_id=None,
        source=DesignSource.designer_uploaded,
        **kw,
    )
    db.add(design)
    db.flush()
    return design


def test_upload_sets_business_id(api, db):
    biz = make_business(db)
    user = make_user(db, business=biz)
    as_business(db, biz.id)
    client = make_client_row(db, assigned_designer_id=user.id)

    r = api.post(
        f"/api/v1/clients/{client.id}/designs/upload",
        headers=auth(user),
        files={"file": ("a.png", io.BytesIO(PNG), "image/png")},
    )
    assert r.status_code == 201
    design = db.get(Design, r.json()["id"])
    assert design.business_id == biz.id


def test_uploaded_image_count_includes_clientless_design(db):
    biz = make_business(db)
    _clientless(db, biz.id, storage_path="designs/x/a.png")
    _clientless(db, biz.id, in_portfolio=True)
    assert image_quota.uploaded_image_count(biz.id, db) == 1
    assert plan_limits.portfolio_design_count(biz.id, db) == 1


def test_rls_hides_other_business_clientless_design(db):
    biz_a = make_business(db)
    biz_b = make_business(db)
    design = _clientless(db, biz_a.id)

    as_business(db, biz_b.id)
    assert db.scalars(select(Design).where(Design.id == design.id)).all() == []

    as_owner(db)
    as_business(db, biz_a.id)
    assert db.scalars(
        select(Design.id).where(Design.id == design.id)
    ).all() == [design.id]


def test_rls_hides_businessless_design(db):
    """Legacy rows left with business_id NULL by 0051 are seen by no one."""
    biz = make_business(db)
    design = _clientless(db, None)

    as_business(db, biz.id)
    assert db.scalars(select(Design).where(Design.id == design.id)).all() == []
