import uuid

from sqlalchemy import select

from backend.models.user import User, UserRole
from backend.services.secret_box import decrypt_secret

from .conftest import auth, make_business, make_user

URL = "/api/v1/businesses"
KEY = "sk-" + "k" * 30


def superadmin(db):
    return auth(make_user(db, role=UserRole.superadmin))


def test_requires_superadmin(api, db):
    biz = make_business(db)
    admin = make_user(db, role=UserRole.admin, business=biz)
    designer = make_user(db, role=UserRole.designer, business=biz)
    assert api.get(URL).status_code == 401
    for user in (admin, designer):
        h = auth(user)
        assert api.get(URL, headers=h).status_code == 403
        assert api.post(URL, headers=h, json={"name": "X"}).status_code == 403
        put = api.put(
            f"{URL}/{biz.id}/openai", headers=h, json={"balanced_model": "o3"}
        )
        assert put.status_code == 403


def test_create_and_list(api, db):
    h = superadmin(db)
    r = api.post(
        URL,
        headers=h,
        json={"name": "SJ Interiors", "contact_email": "a@b.com"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["is_active"] is True
    assert body["has_openai_key"] is False
    assert body["user_count"] == 0
    names = [b["name"] for b in api.get(URL, headers=h).json()]
    assert "SJ Interiors" in names


def test_create_with_admin_user_counts_it(api, db):
    h = superadmin(db)
    r = api.post(
        URL,
        headers=h,
        json={
            "name": "Biz",
            "admin_email": "owner@biz.com",
            "admin_password": "long-enough-pw",
            "admin_name": "Owner",
        },
    )
    assert r.status_code == 201
    assert r.json()["user_count"] == 1
    owner = db.scalars(select(User).where(User.email == "owner@biz.com")).one()
    assert owner.role == UserRole.admin
    assert str(owner.business_id) == r.json()["id"]
    # the new admin can sign in to the portal
    login = api.post(
        "/api/v1/auth/login",
        json={"email": "owner@biz.com", "password": "long-enough-pw"},
    )
    assert login.status_code == 200


def test_create_admin_email_without_password_rejected(api, db):
    r = api.post(
        URL,
        headers=superadmin(db),
        json={"name": "Biz", "admin_email": "owner@biz.com"},
    )
    assert r.status_code == 422


def test_duplicate_name_is_case_insensitive_conflict(api, db):
    h = superadmin(db)
    assert api.post(URL, headers=h, json={"name": "Dup Co"}).status_code == 201
    assert api.post(URL, headers=h, json={"name": "dup co"}).status_code == 409


def test_duplicate_admin_email_conflict(api, db):
    h = superadmin(db)
    make_user(db, email="taken@x.com")
    r = api.post(
        URL,
        headers=h,
        json={
            "name": "Biz",
            "admin_email": "taken@x.com",
            "admin_password": "long-enough-pw",
        },
    )
    assert r.status_code == 409


def test_update_business(api, db):
    h = superadmin(db)
    biz = make_business(db, "Old")
    r = api.patch(f"{URL}/{biz.id}", headers=h, json={"name": "New Name"})
    assert r.status_code == 200
    assert r.json()["name"] == "New Name"


def test_rename_to_existing_name_conflicts(api, db):
    h = superadmin(db)
    make_business(db, "Taken")
    biz = make_business(db, "Other")
    r = api.patch(f"{URL}/{biz.id}", headers=h, json={"name": "taken"})
    assert r.status_code == 409


def test_deactivate_and_activate(api, db):
    h = superadmin(db)
    biz = make_business(db)
    off = api.post(f"{URL}/{biz.id}/deactivate", headers=h)
    assert off.status_code == 200 and off.json()["is_active"] is False
    on = api.post(f"{URL}/{biz.id}/activate", headers=h)
    assert on.json()["is_active"] is True


def test_unknown_business_404(api, db):
    h = superadmin(db)
    ghost = uuid.uuid4()
    patch = api.patch(f"{URL}/{ghost}", headers=h, json={"name": "x"})
    off = api.post(f"{URL}/{ghost}/deactivate", headers=h)
    put = api.put(
        f"{URL}/{ghost}/openai", headers=h, json={"balanced_model": "o3"}
    )
    assert (patch.status_code, off.status_code, put.status_code) == (
        404,
        404,
        404,
    )


# ── OpenAI settings ────────────────────────────────────────────────────────
def test_set_key_stores_encrypted_and_never_returns_it(api, db):
    h = superadmin(db)
    biz = make_business(db)
    r = api.put(f"{URL}/{biz.id}/openai", headers=h, json={"api_key": KEY})
    assert r.status_code == 200
    body = r.json()
    assert body["has_openai_key"] is True
    assert body["openai_key_last4"] == KEY[-4:]
    assert body["openai_key_updated_at"] is not None
    assert KEY not in r.text
    assert "openai_api_key_enc" not in body
    db.refresh(biz)
    assert biz.openai_api_key_enc != KEY
    assert decrypt_secret(biz.openai_api_key_enc) == KEY
    listing = api.get(URL, headers=h)
    assert KEY not in listing.text


def test_tier_models_and_whisper_can_be_set_and_reset(api, db):
    h = superadmin(db)
    biz = make_business(db)
    r = api.put(
        f"{URL}/{biz.id}/openai",
        headers=h,
        json={
            "economy_model": "gpt-4.1-mini",
            "balanced_model": "gpt-4o",
            "premium_model": "gpt-5",
            "whisper_model": "gpt-4o-transcribe",
        },
    )
    body = r.json()
    assert body["openai_model_economy"] == "gpt-4.1-mini"
    assert body["openai_model_balanced"] == "gpt-4o"
    assert body["openai_model_premium"] == "gpt-5"
    assert body["openai_whisper_model"] == "gpt-4o-transcribe"
    r = api.put(
        f"{URL}/{biz.id}/openai", headers=h, json={"balanced_model": ""}
    )
    assert r.json()["openai_model_balanced"] is None
    # other tiers untouched by a single-tier update
    assert r.json()["openai_model_premium"] == "gpt-5"
    # whisper model untouched by a model-only update
    assert r.json()["openai_whisper_model"] == "gpt-4o-transcribe"
    r = api.put(
        f"{URL}/{biz.id}/openai", headers=h, json={"whisper_model": ""}
    )
    assert r.json()["openai_whisper_model"] is None


def test_model_update_keeps_existing_key(api, db):
    h = superadmin(db)
    biz = make_business(db)
    api.put(f"{URL}/{biz.id}/openai", headers=h, json={"api_key": KEY})
    r = api.put(
        f"{URL}/{biz.id}/openai", headers=h, json={"premium_model": "gpt-4.1"}
    )
    assert r.json()["has_openai_key"] is True
    assert r.json()["openai_key_last4"] == KEY[-4:]


def test_invalid_openai_payloads_rejected(api, db):
    h = superadmin(db)
    biz = make_business(db)
    for payload in (
        {},
        {"api_key": "not-a-key"},
        {"economy_model": "bad model!"},
        {"whisper_model": "../etc"},
    ):
        r = api.put(f"{URL}/{biz.id}/openai", headers=h, json=payload)
        assert r.status_code == 422, payload


def test_clear_key_keeps_models(api, db):
    h = superadmin(db)
    biz = make_business(db)
    api.put(
        f"{URL}/{biz.id}/openai",
        headers=h,
        json={"api_key": KEY, "balanced_model": "gpt-4o"},
    )
    r = api.delete(f"{URL}/{biz.id}/openai-key", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["has_openai_key"] is False
    assert body["openai_key_last4"] is None
    assert body["openai_model_balanced"] == "gpt-4o"
    db.refresh(biz)
    assert biz.openai_api_key_enc is None


def test_key_replaced_by_new_key(api, db):
    h = superadmin(db)
    biz = make_business(db)
    new_key = "sk-" + "n" * 30
    api.put(f"{URL}/{biz.id}/openai", headers=h, json={"api_key": KEY})
    api.put(f"{URL}/{biz.id}/openai", headers=h, json={"api_key": new_key})
    db.refresh(biz)
    assert decrypt_secret(biz.openai_api_key_enc) == new_key
    assert biz.openai_key_last4 == new_key[-4:]


def test_image_limits_default_and_update(api, db):
    h = superadmin(db)
    created = api.post(URL, headers=h, json={"name": "Limits Co"}).json()
    assert created["max_images"] == 50
    assert created["max_image_mb"] == 5
    assert created["image_count"] == 0

    r = api.patch(
        f"{URL}/{created['id']}",
        headers=h,
        json={"max_images": None, "max_image_mb": 2},
    )
    assert r.status_code == 200
    assert r.json()["max_images"] is None
    assert r.json()["max_image_mb"] == 2


def test_image_limits_reject_out_of_range(api, db):
    h = superadmin(db)
    biz = make_business(db)
    r = api.patch(f"{URL}/{biz.id}", headers=h, json={"max_image_mb": 0})
    assert r.status_code == 422
