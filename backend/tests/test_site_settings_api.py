import pytest

from backend.models.user import UserRole

from .conftest import as_business, auth, make_business, make_user


def _setup(db, plan="solo", role=UserRole.admin, **kw):
    biz = make_business(db, plan=plan, **kw)
    user = make_user(db, role=role, business=biz)
    as_business(db, biz.id)
    return biz, user


def test_get_site_defaults(api, db):
    biz, user = _setup(db)
    r = api.get("/api/v1/site", headers=auth(user))
    assert r.status_code == 200
    body = r.json()
    assert body["slug"] is None
    assert body["published"] is False
    assert body["mode"] == "site"
    assert body["services"] == [] and body["socials"] == []
    assert body["can_hide_badge"] is False


def test_put_site_saves_and_partial_update_keeps_rest(api, db):
    biz, user = _setup(db)
    payload = {
        "tagline": "  Spaces that breathe ",
        "about": "About us",
        "address": "12 MG Road",
        "phone": "+91 99999 00000",
        "email": "hi@studio.in",
        "services": [{"title": "Kitchens", "description": "Modular"}],
        "socials": [{"label": "Instagram", "url": "https://instagram.com/x"}],
    }
    r = api.put("/api/v1/site", headers=auth(user), json=payload)
    assert r.status_code == 200
    assert r.json()["tagline"] == "Spaces that breathe"
    db.refresh(biz)
    assert biz.contact_phone == "+91 99999 00000"
    assert biz.site_services == [
        {"title": "Kitchens", "description": "Modular"}
    ]

    r = api.put("/api/v1/site", headers=auth(user), json={"tagline": ""})
    body = r.json()
    assert body["tagline"] is None
    assert body["about"] == "About us"
    assert len(body["services"]) == 1


@pytest.mark.parametrize(
    "payload",
    [
        {"tagline": "x" * 121},
        {"about": "x" * 4001},
        {"services": [{"title": f"s{i}"} for i in range(9)]},
        {"services": [{"title": ""}]},
        {"socials": [{"label": "l", "url": "https://a.com"}] * 7},
        {"unknown": 1},
    ],
)
def test_put_site_limits(api, db, payload):
    _, user = _setup(db)
    assert (
        api.put("/api/v1/site", headers=auth(user), json=payload).status_code
        == 422
    )


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "data:text/html,x",
        "ftp://a.com/x",
        "//evil.com",
        "https://",
        "mailto:a@b.com",
    ],
)
def test_socials_reject_javascript_url(api, db, url):
    _, user = _setup(db)
    r = api.put(
        "/api/v1/site",
        headers=auth(user),
        json={"socials": [{"label": "x", "url": url}]},
    )
    assert r.status_code == 422


def test_hide_badge_requires_plan(api, db):
    biz, user = _setup(db, plan="solo")
    r = api.put("/api/v1/site", headers=auth(user), json={"hide_badge": True})
    assert r.status_code == 403
    # turning it off is always fine
    r = api.put("/api/v1/site", headers=auth(user), json={"hide_badge": False})
    assert r.status_code == 200


def test_hide_badge_allowed_on_top_plan(api, db):
    _, user2 = _setup(db, plan="studio_pro")
    r = api.put("/api/v1/site", headers=auth(user2), json={"hide_badge": True})
    assert r.status_code == 200
    assert (
        r.json()["hide_badge"] is True and r.json()["can_hide_badge"] is True
    )


def test_non_admin_forbidden(api, db):
    _, user = _setup(db, role=UserRole.designer)
    for method, path in (
        ("get", "/api/v1/site"),
        ("put", "/api/v1/site"),
        ("get", "/api/v1/site/slug-check?slug=abc"),
        ("put", "/api/v1/site/slug"),
        ("post", "/api/v1/site/publish"),
        ("post", "/api/v1/site/unpublish"),
    ):
        r = getattr(api, method)(path, headers=auth(user))
        assert r.status_code == 403, path


def test_slug_check(api, db):
    _, user = _setup(db)

    def check(s):
        r = api.get(
            "/api/v1/site/slug-check", params={"slug": s}, headers=auth(user)
        )
        assert r.status_code == 200
        return r.json()

    ok = check("  Sj Interiors! ")
    assert ok == {"slug": "sj-interiors", "available": True, "reason": None}
    assert check("admin")["available"] is False
    for junk in ("", "ab", "!!!", "x" * 100, "日本語"):
        res = check(junk)
        assert res["available"] is False and res["reason"]


def test_slug_check_taken_and_own(api, db):
    other = make_business(db, plan="solo", slug="taken-one")
    biz, user = _setup(db, slug="mine-now")
    db.flush()
    as_business(db, biz.id)
    assert other.slug == "taken-one"
    r = api.get(
        "/api/v1/site/slug-check?slug=taken-one", headers=auth(user)
    ).json()
    assert r["available"] is False and "taken" in r["reason"]
    r = api.get(
        "/api/v1/site/slug-check?slug=mine-now", headers=auth(user)
    ).json()
    assert r["available"] is True
    # the probe must not have changed anything
    db.refresh(biz)
    assert biz.slug == "mine-now"


def test_put_slug(api, db):
    biz, user = _setup(db)
    r = api.put(
        "/api/v1/site/slug", headers=auth(user), json={"slug": "Studio X"}
    )
    assert r.status_code == 200 and r.json()["slug"] == "studio-x"
    assert (
        api.put(
            "/api/v1/site/slug", headers=auth(user), json={"slug": "admin"}
        ).status_code
        == 422
    )
    assert (
        api.put(
            "/api/v1/site/slug", headers=auth(user), json={"slug": ""}
        ).status_code
        == 422
    )


def test_put_slug_conflict_409(api, db):
    make_business(db, plan="solo", slug="studio-z")
    _, user = _setup(db)
    r = api.put(
        "/api/v1/site/slug", headers=auth(user), json={"slug": "studio-z"}
    )
    assert r.status_code == 409


def test_publish_without_slug_422(api, db):
    _, user = _setup(db)
    assert (
        api.post("/api/v1/site/publish", headers=auth(user)).status_code == 422
    )


def test_publish_and_unpublish(api, db):
    biz, user = _setup(db, slug="studio-p")
    r = api.post("/api/v1/site/publish", headers=auth(user))
    assert r.status_code == 200 and r.json()["published"] is True
    db.refresh(biz)
    assert biz.site_published is True
    r = api.post("/api/v1/site/unpublish", headers=auth(user))
    assert r.status_code == 200 and r.json()["published"] is False


def test_free_cannot_publish_full_site(api, db):
    biz, user = _setup(db, plan="free", slug="free-one")
    assert (
        api.post("/api/v1/site/publish", headers=auth(user)).status_code == 403
    )
    db.refresh(biz)
    assert biz.site_published is False
    # but Free may still claim a slug (gallery needs one)
    r = api.put(
        "/api/v1/site/slug", headers=auth(user), json={"slug": "free-two"}
    )
    assert r.status_code == 200


def test_expired_paid_plan_cannot_publish(api, db):
    from datetime import UTC, datetime, timedelta

    _, user = _setup(
        db,
        slug="lapsed-one",
        access_expires_at=datetime.now(UTC) - timedelta(days=1),
    )
    r = api.post("/api/v1/site/publish", headers=auth(user))
    assert r.status_code in (402, 403)


def test_reserved_new_slug_422(api, db):
    _, user = _setup(db)
    r = api.put(
        "/api/v1/site/slug", headers=auth(user), json={"slug": "pricing"}
    )
    assert r.status_code == 422


def test_clear_slug_withdraws_public_link(api, db):
    biz, user = _setup(db, plan="free")
    h = auth(user)
    api.put("/api/v1/site/slug", headers=h, json={"slug": "acme"})
    api.put("/api/v1/site/slug", headers=h, json={"slug": "acme-2"})
    assert api.get("/api/v1/site/acme-2").status_code == 200

    r = api.delete("/api/v1/site/slug", headers=h)
    assert r.status_code == 200 and r.json()["slug"] is None
    for s in ("acme-2", "acme"):
        r = api.get(f"/api/v1/site/{s}")
        assert r.status_code == 404
        assert r.json()["detail"] == "Site not available"
    # Idempotent, and publishing needs an address again.
    assert api.delete("/api/v1/site/slug", headers=h).status_code == 200
    biz.plan = "solo"
    db.flush()
    assert api.post("/api/v1/site/publish", headers=h).status_code == 422
    # The same business can claim an address again, even an old one.
    r = api.put("/api/v1/site/slug", headers=h, json={"slug": "acme"})
    assert r.status_code == 200 and r.json()["slug"] == "acme"
    assert api.post("/api/v1/site/publish", headers=h).status_code == 200
    assert api.get("/api/v1/site/acme").status_code == 200


def test_clear_slug_requires_admin(api, db):
    _, user = _setup(db, role=UserRole.designer)
    assert (
        api.delete("/api/v1/site/slug", headers=auth(user)).status_code == 403
    )


def test_theme_defaults_to_classic_and_saves(api, db):
    _, user = _setup(db)
    assert (
        api.get("/api/v1/site", headers=auth(user)).json()["theme"]
        == "classic"
    )
    r = api.put(
        "/api/v1/site", headers=auth(user), json={"theme": "warm-linen"}
    )
    assert r.status_code == 200 and r.json()["theme"] == "warm-linen"
    # an unrelated partial update keeps the theme
    r = api.put("/api/v1/site", headers=auth(user), json={"tagline": "Hi"})
    assert r.json()["theme"] == "warm-linen"


def test_theme_rejects_unknown_key(api, db):
    _, user = _setup(db)
    r = api.put("/api/v1/site", headers=auth(user), json={"theme": "neon"})
    assert r.status_code == 422
