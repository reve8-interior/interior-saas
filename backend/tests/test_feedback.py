from backend.models.feedback import Feedback
from backend.models.user import UserRole
from backend.services.feedback_catalog import BY_FEATURE, CATALOG

from .conftest import as_owner, auth, make_business, make_user


def test_catalog_has_unique_features_with_options():
    assert len({p.feature for p in CATALOG}) == len(CATALOG)
    assert all(p.options for p in CATALOG)


def test_next_returns_a_prompt(api, db):
    user = make_user(db, business=make_business(db))
    res = api.get("/api/v1/feedback/next", headers=auth(user))
    assert res.status_code == 200
    assert res.json()["feature"] in BY_FEATURE


def test_next_skips_answered_features_until_none_left(api, db):
    user = make_user(db, business=make_business(db))
    for prompt in CATALOG:
        res = api.post(
            "/api/v1/feedback",
            json={"feature": prompt.feature, "rating": 4},
            headers=auth(user),
        )
        assert res.status_code == 201
    res = api.get("/api/v1/feedback/next", headers=auth(user))
    assert res.status_code == 200
    assert res.json() is None


def test_answering_again_replaces_the_old_answer(api, db):
    user = make_user(db, business=make_business(db))
    body = {"feature": "designs", "rating": 2, "choice": "upload"}
    api.post("/api/v1/feedback", json=body, headers=auth(user))
    api.post(
        "/api/v1/feedback",
        json={**body, "rating": 5, "choice": "hotspots"},
        headers=auth(user),
    )
    rows = db.query(Feedback).filter_by(user_id=user.id).all()
    assert [(r.rating, r.choice) for r in rows] == [(5, "hotspots")]
    assert rows[0].business_id == user.business_id


def test_rejects_bad_input(api, db):
    user = make_user(db, business=make_business(db))
    post = lambda body: api.post(  # noqa: E731
        "/api/v1/feedback", json=body, headers=auth(user)
    )
    assert post({"feature": "nope", "rating": 3}).status_code == 422
    assert post({"feature": "designs", "rating": 0}).status_code == 422
    assert post({"feature": "designs", "rating": 6}).status_code == 422
    bad_choice = {"feature": "designs", "rating": 3, "choice": "speed"}
    assert post(bad_choice).status_code == 422


def test_viewer_cannot_submit(api, db):
    viewer = make_user(db, role=UserRole.viewer, business=make_business(db))
    res = api.post(
        "/api/v1/feedback",
        json={"feature": "designs", "rating": 3},
        headers=auth(viewer),
    )
    assert res.status_code == 403


def test_requires_login(api):
    assert api.get("/api/v1/feedback/next").status_code == 401


def test_admin_summary_aggregates_and_is_superadmin_only(api, db):
    alpha = make_business(db, "Alpha")
    u1 = make_user(db, business=alpha, email="a@alpha.com")
    u2 = make_user(db, business=alpha, email="b@alpha.com")
    for user, rating, choice in ((u1, 5, "upload"), (u2, 3, "upload")):
        api.post(
            "/api/v1/feedback",
            json={"feature": "designs", "rating": rating, "choice": choice},
            headers=auth(user),
        )
    api.post(
        "/api/v1/feedback",
        json={"feature": "overall", "rating": 4},
        headers=auth(u1),
    )
    as_owner(db)
    admin = make_user(db, role=UserRole.superadmin)

    assert (
        api.get("/api/v1/admin/feedback", headers=auth(u1)).status_code == 403
    )

    data = api.get("/api/v1/admin/feedback", headers=auth(admin)).json()
    assert data["total"] == 3
    assert data["avg_rating"] == 4.0
    designs = next(f for f in data["features"] if f["feature"] == "designs")
    assert designs["count"] == 2
    assert designs["avg_rating"] == 4.0
    upload = next(c for c in designs["choices"] if c["value"] == "upload")
    assert upload["count"] == 2
    assert {e["business_name"] for e in data["recent"]} == {"Alpha"}
    assert {e["user_email"] for e in data["recent"]} == {
        "a@alpha.com",
        "b@alpha.com",
    }
