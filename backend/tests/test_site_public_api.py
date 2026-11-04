import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from backend.models.design import Design, DesignHotspot, DesignSource
from backend.models.project import Project
from backend.models.slug_alias import SlugAlias
from backend.models.user import UserRole
from backend.routers.site import PUBLIC_RATE_LIMIT

from .conftest import auth, make_business, make_client_row, make_user

NOT_AVAILABLE = {"detail": "Site not available"}


def _url(slug: str) -> str:
    return f"/api/v1/site/{slug}"


def _biz(db, plan="solo", slug=None, **kw):
    return make_business(
        db, plan=plan, slug=slug or f"s-{uuid.uuid4().hex[:8]}", **kw
    )


def _client(db, biz, **kw):
    return make_client_row(
        db, name="Secret Client Name", business_id=biz.id, **kw
    )


def _design(db, biz, client=None, **kw):
    design = Design(
        id=uuid.uuid4(),
        business_id=biz.id,
        client_id=client.id if client else None,
        source=DesignSource.designer_uploaded,
        image_url=f"https://example.com/{uuid.uuid4().hex}.png",
        specs_json={"labor_estimate": 999},
        **kw,
    )
    db.add(design)
    db.flush()
    return design


def _hotspot(db, design):
    db.add(
        DesignHotspot(
            design_id=design.id,
            label="Sofa",
            labour_cost=Decimal("1234.00"),
            x=0.1,
            y=0.2,
        )
    )
    db.flush()


def _project(db, biz, title="Villa", **kw):
    project = Project(id=uuid.uuid4(), business_id=biz.id, title=title, **kw)
    db.add(project)
    db.flush()
    return project


def test_free_gets_gallery(api, db):
    biz = _biz(db, plan="free")
    client = _client(db, biz)
    second = _design(db, biz, client, title="B", in_portfolio=True)
    first = _design(
        db, biz, client, title="A", in_portfolio=True, portfolio_position=0
    )
    _hotspot(db, first)
    _design(db, biz, client, title="hidden", in_portfolio=False)
    inactive = _client(db, biz, is_active=False)
    _design(db, biz, inactive, title="inactive", in_portfolio=True)
    other = _biz(db, plan="free")
    _design(db, other, _client(db, other), title="other", in_portfolio=True)

    r = api.get(_url(biz.slug))
    assert r.status_code == 200
    assert r.headers["Cache-Control"] == "public, max-age=60"
    body = r.json()
    assert body["mode"] == "gallery"
    assert body["business_name"] == biz.name
    assert [d["id"] for d in body["designs"]] == [
        str(first.id),
        str(second.id),
    ]
    assert set(body["designs"][0]) == {
        "id",
        "title",
        "description",
        "image_url",
        "thumb_url",
    }


def test_free_gallery_needs_no_publish(api, db):
    biz = _biz(db, plan="free", site_published=False)
    assert api.get(_url(biz.slug)).json()["mode"] == "gallery"


def test_solo_published_gets_site(api, db):
    biz = _biz(
        db,
        site_published=True,
        site_tagline="Calm spaces",
        site_about="About",
        site_address="12 MG Road",
        contact_email="hi@studio.in",
        contact_phone="+91 1",
        site_services=[{"title": "Kitchens", "description": "Modular"}],
        site_socials=[{"label": "IG", "url": "https://instagram.com/x"}],
        logo_path=f"branding/{uuid.uuid4()}/logo-x.png",
    )
    later = _project(db, biz, title="Later", position=1)
    villa = _project(
        db, biz, title="Villa", position=0, location="Pune", year=2024
    )
    d2 = _design(
        db, biz, project_id=villa.id, project_position=1, rooms=["Kitchen"]
    )
    d1 = _design(db, biz, project_id=villa.id, project_position=0)
    villa.cover_design_id = d2.id
    db.flush()

    r = api.get(_url(biz.slug.upper() + " "))
    assert r.status_code == 200, r.text
    assert r.headers["Cache-Control"] == "public, max-age=60"
    body = r.json()
    assert body["mode"] == "site"
    assert body["slug"] == biz.slug
    assert body["tagline"] == "Calm spaces"
    assert body["contact"] == {
        "email": "hi@studio.in",
        "phone": "+91 1",
        "address": "12 MG Road",
    }
    assert body["services"] == [
        {"title": "Kitchens", "description": "Modular"}
    ]
    assert body["socials"][0]["label"] == "IG"
    assert body["logo_url"] and "/api/v1/media/" in body["logo_url"]
    assert body["hero_url"] is None
    assert body["show_badge"] is True
    assert [p["id"] for p in body["projects"]] == [
        str(villa.id),
        str(later.id),
    ]
    p = body["projects"][0]
    assert p["location"] == "Pune" and p["year"] == 2024
    assert [d["id"] for d in p["designs"]] == [str(d1.id), str(d2.id)]
    assert p["designs"][1]["rooms"] == ["Kitchen"]
    assert p["cover_url"] == d2.image_url


def test_cover_falls_back_to_first_design(api, db):
    biz = _biz(db, site_published=True)
    project = _project(db, biz)
    first = _design(db, biz, project_id=project.id, project_position=0)
    _design(db, biz, project_id=project.id, project_position=1)
    body = api.get(_url(biz.slug)).json()
    assert body["projects"][0]["cover_url"] == first.image_url


def test_project_with_no_designs_ok(api, db):
    biz = _biz(db, site_published=True)
    _project(db, biz, title="Empty")
    r = api.get(_url(biz.slug))
    assert r.status_code == 200
    p = r.json()["projects"][0]
    assert p["title"] == "Empty"
    assert p["designs"] == [] and p["cover_url"] is None


def test_unpublished_site_404_same_as_unknown(api, db):
    biz = _biz(db, site_published=False)
    r = api.get(_url(biz.slug))
    unknown = api.get(_url("no-such-studio"))
    assert r.status_code == unknown.status_code == 404
    assert r.json() == unknown.json() == NOT_AVAILABLE
    assert "Cache-Control" not in r.headers


def test_old_slug_redirect(api, db):
    biz = _biz(db, slug="new-name", site_published=True)
    db.add(SlugAlias(slug="old-name", business_id=biz.id))
    db.flush()
    r = api.get(_url("old-name"))
    assert r.status_code == 200
    assert r.json() == {"mode": "redirect", "slug": "new-name"}


def test_downgrade_serves_gallery_keeps_projects(api, db):
    biz = _biz(db, site_published=True)
    project = _project(db, biz)
    _design(db, biz, project_id=project.id)
    assert api.get(_url(biz.slug)).json()["mode"] == "site"

    biz.plan = "free"
    db.flush()
    body = api.get(_url(biz.slug)).json()
    assert body["mode"] == "gallery" and "projects" not in body
    assert db.get(Project, project.id) is not None


def test_lapsed_paid_plan_serves_gallery(api, db):
    biz = _biz(
        db,
        site_published=True,
        access_expires_at=datetime.now(UTC) - timedelta(days=1),
    )
    _project(db, biz)
    assert api.get(_url(biz.slug)).json()["mode"] == "gallery"


def test_payload_has_no_hotspots_prices_or_client_fields(api, db):
    for plan in ("free", "solo"):
        biz = _biz(db, plan=plan, site_published=True)
        client = _client(db, biz)
        project = _project(db, biz)
        design = _design(
            db,
            biz,
            client,
            in_portfolio=True,
            project_id=project.id,
            storage_path=None,
        )
        _hotspot(db, design)
        r = api.get(_url(biz.slug))
        assert r.status_code == 200
        assert r.json()["designs" if plan == "free" else "projects"]
        text = r.text.lower()
        for banned in (
            "hotspot",
            "price",
            "client",
            "labour",
            "cost",
            "specs",
            "source",
            "storage_path",
            "1234",
            "secret client name",
        ):
            assert banned not in text, (plan, banned)


def test_project_skips_inactive_client_designs(api, db):
    biz = _biz(db, site_published=True)
    project = _project(db, biz)
    gone = _client(db, biz, is_active=False)
    _design(db, biz, gone, project_id=project.id)
    kept = _design(db, biz, project_id=project.id)
    designs = api.get(_url(biz.slug)).json()["projects"][0]["designs"]
    assert [d["id"] for d in designs] == [str(kept.id)]


def test_show_badge_hidden_only_when_plan_allows(api, db):
    pro = _biz(db, plan="studio_pro", site_published=True, hide_badge=True)
    assert api.get(_url(pro.slug)).json()["show_badge"] is False
    # hide_badge left on after a downgrade to a plan that cannot hide it
    solo = _biz(db, plan="solo", site_published=True, hide_badge=True)
    assert api.get(_url(solo.slug)).json()["show_badge"] is True


@pytest.mark.parametrize("plan", ["free", "solo"])
def test_inactive_business_404(api, db, plan):
    biz = _biz(db, plan=plan, site_published=True, is_active=False)
    r = api.get(_url(biz.slug))
    assert r.status_code == 404 and r.json() == NOT_AVAILABLE


def test_inactive_business_alias_404(api, db):
    biz = _biz(db, slug="dead-new", is_active=False)
    db.add(SlugAlias(slug="dead-old", business_id=biz.id))
    db.flush()
    r = api.get(_url("dead-old"))
    assert r.status_code == 404 and r.json() == NOT_AVAILABLE


@pytest.mark.parametrize(
    "slug",
    [
        "..",
        "..%2F..%2Fetc",
        "%2E%2E%2F",
        "日本語",
        "x" * 500,
        "a%20b",
        "a%00b",
        "a_b",
        "-",
    ],
)
def test_odd_slugs_404(api, db, slug):
    r = api.get(_url(slug))
    assert r.status_code == 404


def test_rate_limit_429(api, db):
    for _ in range(PUBLIC_RATE_LIMIT):
        assert api.get(_url("no-such-studio")).status_code == 404
    r = api.get(_url("no-such-studio"))
    assert r.status_code == 429


def test_preview_works_when_unpublished(api, db):
    biz = _biz(db, site_published=False)
    _project(db, biz, title="Draft")
    user = make_user(db, role=UserRole.admin, business=biz)
    r = api.get("/api/v1/site/preview", headers=auth(user))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "site"
    assert body["projects"][0]["title"] == "Draft"
    # public view of the same business is still 404
    assert api.get(_url(biz.slug)).status_code == 404


def test_preview_free_is_gallery(api, db):
    biz = _biz(db, plan="free")
    user = make_user(db, role=UserRole.admin, business=biz)
    r = api.get("/api/v1/site/preview", headers=auth(user))
    assert r.status_code == 200 and r.json()["mode"] == "gallery"


def test_preview_requires_admin(api, db):
    biz = _biz(db)
    designer = make_user(db, role=UserRole.designer, business=biz)
    r = api.get("/api/v1/site/preview", headers=auth(designer))
    assert r.status_code == 403
    assert api.get("/api/v1/site/preview").status_code == 401


def test_preview_exposes_theme_for_unpublished_site(api, db):
    biz = _biz(db, site_published=False, site_theme="blush-modern")
    admin = make_user(db, role=UserRole.admin, business=biz)
    r = api.get("/api/v1/site/preview", headers=auth(admin))
    assert r.status_code == 200 and r.json()["theme"] == "blush-modern"


def test_public_site_exposes_theme(api, db):
    biz = _biz(db, site_published=True, site_theme="midnight-gold")
    r = api.get(_url(biz.slug))
    assert r.status_code == 200 and r.json()["theme"] == "midnight-gold"
