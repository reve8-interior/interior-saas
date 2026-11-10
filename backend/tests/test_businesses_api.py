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
            f"{URL}/{biz.id}/openai", headers=h, json={"chat_model": "o3"}
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


def test_create_admin_email_generates_temporary_password(api, db):
    r = api.post(
        URL,
        headers=superadmin(db),
        json={"name": "Biz", "admin_email": "owner@biz.com"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["contact_email"] == "owner@biz.com"
    temp = body["temporary_password"]
    assert temp and len(temp) >= 8
    login = api.post(
        "/api/v1/auth/login",
        json={"email": "owner@biz.com", "password": temp},
    )
    assert login.status_code == 200


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
        f"{URL}/{ghost}/openai", headers=h, json={"chat_model": "o3"}
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


def test_chat_and_whisper_models_can_be_set_and_reset(api, db):
    h = superadmin(db)
    biz = make_business(db)
    r = api.put(
        f"{URL}/{biz.id}/openai",
        headers=h,
        json={"chat_model": "gpt-4o", "whisper_model": "gpt-4o-transcribe"},
    )
    body = r.json()
    assert body["openai_chat_model"] == "gpt-4o"
    assert body["openai_whisper_model"] == "gpt-4o-transcribe"
    r = api.put(f"{URL}/{biz.id}/openai", headers=h, json={"chat_model": ""})
    assert r.json()["openai_chat_model"] is None
    # whisper model untouched by a chat-model-only update
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
        f"{URL}/{biz.id}/openai", headers=h, json={"chat_model": "gpt-4.1"}
    )
    assert r.json()["has_openai_key"] is True
    assert r.json()["openai_key_last4"] == KEY[-4:]


def test_invalid_openai_payloads_rejected(api, db):
    h = superadmin(db)
    biz = make_business(db)
    for payload in (
        {},
        {"api_key": "not-a-key"},
        {"chat_model": "bad model!"},
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
        json={"api_key": KEY, "chat_model": "gpt-4o"},
    )
    r = api.delete(f"{URL}/{biz.id}/openai-key", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["has_openai_key"] is False
    assert body["openai_key_last4"] is None
    assert body["openai_chat_model"] == "gpt-4o"
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


def test_image_limits_follow_the_plan_until_overridden(api, db):
    h = superadmin(db)
    created = api.post(URL, headers=h, json={"name": "Limits Co"}).json()
    assert created["max_images"] is None
    assert created["limits"]["max_images"] == 20
    assert created["image_count"] == 0

    r = api.patch(
        f"{URL}/{created['id']}",
        headers=h,
        json={"max_images": 7, "max_image_mb": 2},
    )
    assert r.status_code == 200
    assert r.json()["max_images"] == 7
    assert r.json()["limits"]["max_images"] == 7
    assert r.json()["limits"]["max_image_mb"] == 2

    cleared = api.patch(
        f"{URL}/{created['id']}", headers=h, json={"max_images": None}
    )
    assert cleared.json()["max_images"] is None
    assert cleared.json()["limits"]["max_images"] == 20


def test_image_limits_reject_out_of_range(api, db):
    h = superadmin(db)
    biz = make_business(db)
    r = api.patch(f"{URL}/{biz.id}", headers=h, json={"max_image_mb": 0})
    assert r.status_code == 422


def test_supplied_admin_password_is_not_echoed_back(api, db):
    r = api.post(
        URL,
        headers=superadmin(db),
        json={
            "name": "Biz",
            "admin_email": "owner@biz.com",
            "admin_password": "chosen-pass-1",
        },
    )
    assert r.status_code == 201
    assert r.json()["temporary_password"] is None


def test_no_admin_email_means_no_temporary_password(api, db):
    r = api.post(URL, headers=superadmin(db), json={"name": "Biz"})
    assert r.status_code == 201
    assert r.json()["temporary_password"] is None
    assert r.json()["contact_email"] is None


def test_contact_email_defaults_to_admin_but_explicit_one_wins(api, db):
    h = superadmin(db)
    explicit = api.post(
        URL,
        headers=h,
        json={
            "name": "One",
            "admin_email": "admin@one.com",
            "contact_email": "office@one.com",
        },
    )
    assert explicit.json()["contact_email"] == "office@one.com"


def test_generated_passwords_differ_per_business(api, db):
    h = superadmin(db)
    passwords = {
        api.post(
            URL,
            headers=h,
            json={"name": f"Biz {i}", "admin_email": f"a{i}@biz.com"},
        ).json()["temporary_password"]
        for i in range(3)
    }
    assert len(passwords) == 3


def test_generated_password_forces_change_on_first_login(api, db):
    body = api.post(
        URL,
        headers=superadmin(db),
        json={"name": "Biz", "admin_email": "owner@biz.com"},
    ).json()
    user = db.execute(
        select(User).where(User.email == "owner@biz.com")
    ).scalar_one()
    assert user.must_change_password is True
    assert user.password_hash != body["temporary_password"]


def test_create_applies_the_chosen_plan_and_overrides(api, db):
    r = api.post(
        URL,
        headers=superadmin(db),
        json={
            "name": "Studio Co",
            "plan": "studio",
            "ai_credit_bonus": 25,
            "max_users": 4,
            "max_clients": 12,
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["plan"] == "studio"
    assert body["ai_credit_bonus"] == 25
    assert body["max_users"] == 4 and body["max_clients"] == 12
    assert body["limits"]["max_users"] == 4
    assert body["limits"]["max_clients"] == 12
    # not overridden: follows the plan
    assert body["max_images"] is None
    assert body["limits"]["max_images"] == 3000


def test_create_with_unknown_plan_is_rejected_and_adds_nothing(api, db):
    h = superadmin(db)
    r = api.post(
        URL,
        headers=h,
        json={
            "name": "Ghost Co",
            "plan": "ghost",
            "admin_email": "ghost@biz.com",
        },
    )
    assert r.status_code == 422
    assert "Ghost Co" not in [
        b["name"] for b in api.get(URL, headers=h).json()
    ]
    assert not db.scalars(
        select(User).where(User.email == "ghost@biz.com")
    ).first()


def test_create_rejects_out_of_range_override(api, db):
    r = api.post(
        URL,
        headers=superadmin(db),
        json={"name": "Bad Limits", "max_image_mb": 0},
    )
    assert r.status_code == 422


def test_list_shows_the_real_plan_name_and_access_countdown(api, db):
    from datetime import UTC, datetime, timedelta

    from backend.services.plan_limits import seed_plans

    seed_plans(db)
    admin = superadmin(db)
    make_business(
        db,
        name="Paid Studio",
        plan="studio",
        access_expires_at=datetime.now(UTC) + timedelta(days=100),
    )
    make_business(
        db,
        name="Lapsed Co",
        plan="solo",
        access_expires_at=datetime.now(UTC) - timedelta(days=1),
    )
    make_business(db, name="Free Co")
    rows = {
        b["name"]: b
        for b in api.get("/api/v1/businesses", headers=admin).json()
    }
    assert rows["Paid Studio"]["plan_name"] == "Studio"
    assert rows["Paid Studio"]["limits"]["plan"] == "studio"
    assert rows["Paid Studio"]["days_left"] in (99, 100)
    assert rows["Paid Studio"]["access_expired"] is False
    assert rows["Lapsed Co"]["plan_name"] == "Free"
    assert rows["Lapsed Co"]["access_expired"] is True
    assert rows["Free Co"]["plan_name"] == "Free"
    assert rows["Free Co"]["days_left"] is None


def test_plan_cannot_be_changed_under_a_live_monthly_subscription(api, db):
    h = superadmin(db)
    biz = make_business(
        db,
        "Paying",
        plan="solo",
        billing_cycle="monthly",
        subscription_status="active",
    )
    r = api.patch(f"{URL}/{biz.id}", headers=h, json={"plan": "studio"})
    assert r.status_code == 409
    assert "monthly subscription" in r.json()["detail"]
    # Other edits, and re-saving the same plan, are still fine.
    assert (
        api.patch(
            f"{URL}/{biz.id}", headers=h, json={"plan": "solo"}
        ).status_code
        == 200
    )
    assert (
        api.patch(
            f"{URL}/{biz.id}", headers=h, json={"name": "Renamed"}
        ).status_code
        == 200
    )


def test_plan_can_be_changed_when_nothing_is_subscribed(api, db):
    h = superadmin(db)
    for i, state in enumerate(
        (
            {},
            {"billing_cycle": "monthly", "subscription_status": "cancelled"},
            {"billing_cycle": "yearly", "subscription_status": "active"},
        )
    ):
        biz = make_business(db, f"Free {i}", **state)
        r = api.patch(f"{URL}/{biz.id}", headers=h, json={"plan": "solo"})
        assert r.status_code == 200, state
