"""Invite flows end to end: who is emailed what, from whom, and what is left
behind. Complements test_invites_api.py (happy paths) with edge cases."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from backend.core.config import settings
from backend.models.audit import AuditLog
from backend.models.business import Business
from backend.models.user import User, UserRole
from backend.services import invites, mailer

from .conftest import (
    PASSWORD,
    auth,
    invite_token,
    make_business,
    make_user,
)

TEAM = "/api/v1/team"
BUSINESSES = "/api/v1/businesses"
ACCEPT = "/api/v1/auth/accept-invite"
LOGIN = "/api/v1/auth/login"
ME = "/api/v1/auth/me"
NEW_PASSWORD = "my-chosen-pass-1"


def _studio(db, **kw):
    kw.setdefault("plan", "studio_pro")
    biz = make_business(db, **kw)
    return biz, make_user(db, role=UserRole.admin, business=biz)


def _fail_mail(monkeypatch) -> None:
    def refuse(*args, **kwargs):
        raise mailer.MailError("down")

    monkeypatch.setattr(invites, "send_email", refuse)


def _user(db, email: str) -> User:
    return db.scalar(select(User).where(User.email == email))


# -- feature flag --------------------------------------------------------


def test_me_reports_invites_enabled_when_email_is_configured(api, db, outbox):
    _, admin = _studio(db)
    assert api.get(ME, headers=auth(admin)).json()["invites_enabled"] is True


def test_me_reports_invites_disabled_without_email(api, db):
    _, admin = _studio(db)
    assert api.get(ME, headers=auth(admin)).json()["invites_enabled"] is False


# -- creating team members ---------------------------------------------


@pytest.mark.parametrize("role", ["admin", "designer", "viewer"])
def test_every_role_can_be_invited(api, db, outbox, role):
    _, admin = _studio(db)
    r = api.post(
        TEAM,
        headers=auth(admin),
        json={"email": f"{role}@x.com", "role": role},
    )
    assert r.status_code == 201
    assert r.json()["role"] == role
    assert r.json()["invite_sent"] is True
    assert len(outbox) == 1


def test_a_duplicate_email_sends_nothing(api, db, outbox):
    _, admin = _studio(db)
    body = {"email": "same@x.com"}
    assert api.post(TEAM, headers=auth(admin), json=body).status_code == 201
    again = api.post(TEAM, headers=auth(admin), json={"email": "SAME@x.com"})
    assert again.status_code == 409
    assert len(outbox) == 1


def test_a_full_team_sends_nothing(api, db, outbox):
    _, admin = _studio(db, max_users=1)
    r = api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    assert r.status_code == 409
    assert outbox == []


def test_a_malformed_email_is_rejected_before_anything_is_sent(
    api, db, outbox
):
    _, admin = _studio(db)
    r = api.post(TEAM, headers=auth(admin), json={"email": "not-an-email"})
    assert r.status_code == 422
    assert outbox == []


def test_a_short_explicit_password_is_rejected(api, db, outbox):
    _, admin = _studio(db)
    r = api.post(
        TEAM,
        headers=auth(admin),
        json={"email": "n@x.com", "password": "short"},
    )
    assert r.status_code == 422
    assert outbox == []


def test_a_studio_invite_is_the_team_email_from_the_studio(api, db, outbox):
    biz, admin = _studio(db, name="SJ Interior DND")
    api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    sent = outbox[0]
    assert sent.subject == "SJ Interior DND invites you to join the team"
    assert sent.from_name == "SJ Interior DND"
    assert sent.reply_to == admin.email
    assert sent.html and "Accept invite" in sent.html
    assert "choosing Reve8" not in sent.body


def test_platform_admin_adding_a_designer_sends_the_studio_invite(
    api, db, outbox
):
    biz, _ = _studio(db, name="SJ Interior DND", contact_email="hi@sj.com")
    superadmin = make_user(db, role=UserRole.superadmin)
    r = api.post(
        f"{BUSINESSES}/{biz.id}/users",
        headers=auth(superadmin),
        json={"email": "d@x.com", "role": "designer"},
    )
    assert r.status_code == 201
    sent = outbox[0]
    assert sent.subject == "SJ Interior DND invites you to join the team"
    assert sent.from_name == "SJ Interior DND"
    # Replies go to the studio, not to the platform admin.
    assert sent.reply_to == "hi@sj.com"


def test_platform_admin_adding_a_business_admin_sends_the_welcome(
    api, db, outbox
):
    biz, _ = _studio(db, name="SJ Interior DND")
    superadmin = make_user(db, role=UserRole.superadmin)
    api.post(
        f"{BUSINESSES}/{biz.id}/users",
        headers=auth(superadmin),
        json={"email": "boss@x.com", "role": "admin"},
    )
    sent = outbox[0]
    assert sent.subject == "Welcome to Reve8, SJ Interior DND"
    assert sent.from_name is None
    assert sent.reply_to is None


def test_a_mail_failure_on_create_is_a_502_with_no_provider_detail(
    api, db, outbox, monkeypatch
):
    _, admin = _studio(db)
    _fail_mail(monkeypatch)
    r = api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    assert r.status_code == 502
    assert "down" not in r.text
    assert "invite email" in r.json()["detail"]


def test_without_email_a_password_is_generated_and_nothing_is_pending(api, db):
    _, admin = _studio(db)
    body = api.post(
        TEAM, headers=auth(admin), json={"email": "n@x.com"}
    ).json()
    assert body["invite_sent"] is False
    assert body["invite_pending"] is False
    assert len(body["temporary_password"]) >= 12
    assert body["must_change_password"] is True


def test_an_explicit_password_is_never_echoed_back(api, db, outbox):
    _, admin = _studio(db)
    body = api.post(
        TEAM,
        headers=auth(admin),
        json={"email": "n@x.com", "password": "typed-pass-123"},
    ).json()
    assert body["temporary_password"] is None
    assert body["invite_sent"] is False
    assert outbox == []


def test_invite_lifetime_follows_the_setting(api, db, outbox, monkeypatch):
    monkeypatch.setattr(settings, "invite_ttl_hours", 1)
    _, admin = _studio(db)
    api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    user = _user(db, "n@x.com")
    expected = datetime.now(timezone.utc) + timedelta(hours=1)
    assert abs(user.invite_expires_at - expected) < timedelta(minutes=2)
    assert "expires in 1 hours" in outbox[0].body


def test_the_audit_trail_records_that_an_invite_was_sent(api, db, outbox):
    biz, admin = _studio(db)
    api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    entry = db.scalar(
        select(AuditLog).where(AuditLog.action == "team.member_added")
    )
    assert entry.payload["invited"] is True
    assert entry.payload["email"] == "n@x.com"
    # The token itself is never written to the audit log.
    assert invite_token(outbox) not in str(entry.payload)


# -- accepting ----------------------------------------------------------


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"token": "t" * 30},
        {"new_password": NEW_PASSWORD},
        {"token": "short", "new_password": NEW_PASSWORD},
        {"token": "t" * 30, "new_password": "short"},
        {"token": "t" * 201, "new_password": NEW_PASSWORD},
        {"token": "t" * 30, "new_password": "p" * 129},
    ],
)
def test_accept_validates_its_input(api, payload):
    assert api.post(ACCEPT, json=payload).status_code == 422


def test_accept_is_public_and_needs_no_login(api, db, outbox):
    _, admin = _studio(db)
    api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    r = api.post(
        ACCEPT,
        json={"token": invite_token(outbox), "new_password": NEW_PASSWORD},
    )
    assert r.status_code == 204
    assert r.content == b""


def test_after_accepting_the_person_signs_in_with_the_new_password_only(
    api, db, outbox
):
    _, admin = _studio(db)
    api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    api.post(
        ACCEPT,
        json={"token": invite_token(outbox), "new_password": NEW_PASSWORD},
    )
    ok = api.post(LOGIN, json={"email": "n@x.com", "password": NEW_PASSWORD})
    assert ok.status_code == 200
    bad = api.post(LOGIN, json={"email": "n@x.com", "password": PASSWORD})
    assert bad.status_code == 401
    me = api.get(
        ME, headers={"Authorization": f"Bearer {ok.json()['access_token']}"}
    )
    assert me.json()["must_change_password"] is False


def test_before_accepting_no_password_works(api, db, outbox):
    _, admin = _studio(db)
    api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    for guess in (PASSWORD, "", "changeme", "temp-pass-123"):
        r = api.post(LOGIN, json={"email": "n@x.com", "password": guess})
        assert r.status_code == 401


def test_accepting_is_audited_against_the_business(api, db, outbox):
    biz, admin = _studio(db)
    api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    token = invite_token(outbox)
    api.post(ACCEPT, json={"token": token, "new_password": NEW_PASSWORD})
    entry = db.scalar(
        select(AuditLog).where(AuditLog.action == "auth.invite_accepted")
    )
    assert entry.business_id == biz.id
    assert token not in str(entry.payload)


def test_a_disabled_member_can_accept_but_still_cannot_sign_in(
    api, db, outbox
):
    _, admin = _studio(db)
    created = api.post(
        TEAM, headers=auth(admin), json={"email": "n@x.com"}
    ).json()
    api.patch(
        f"{TEAM}/{created['id']}",
        headers=auth(admin),
        json={"is_active": False},
    )
    accepted = api.post(
        ACCEPT,
        json={"token": invite_token(outbox), "new_password": NEW_PASSWORD},
    )
    assert accepted.status_code == 204
    login = api.post(
        LOGIN, json={"email": "n@x.com", "password": NEW_PASSWORD}
    )
    assert login.status_code == 403


def test_a_removed_member_cannot_use_their_old_link(api, db, outbox):
    _, admin = _studio(db)
    created = api.post(
        TEAM, headers=auth(admin), json={"email": "n@x.com"}
    ).json()
    token = invite_token(outbox)
    assert (
        api.delete(f"{TEAM}/{created['id']}", headers=auth(admin)).status_code
        == 204
    )
    r = api.post(ACCEPT, json={"token": token, "new_password": NEW_PASSWORD})
    assert r.status_code == 400


def test_the_pending_flag_clears_once_accepted(api, db, outbox):
    _, admin = _studio(db)
    api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})

    def pending() -> dict[str, bool]:
        members = api.get(TEAM, headers=auth(admin)).json()["members"]
        return {m["email"]: m["invite_pending"] for m in members}

    assert pending()["n@x.com"] is True
    api.post(
        ACCEPT,
        json={"token": invite_token(outbox), "new_password": NEW_PASSWORD},
    )
    assert pending()["n@x.com"] is False


# -- resending ----------------------------------------------------------


def test_resending_replaces_the_link_and_the_old_one_dies(api, db, outbox):
    _, admin = _studio(db)
    created = api.post(
        TEAM, headers=auth(admin), json={"email": "n@x.com"}
    ).json()
    first = invite_token(outbox)

    r = api.post(
        f"{TEAM}/{created['id']}/reset-password", headers=auth(admin), json={}
    )
    assert r.json() == {"invite_sent": True, "temporary_password": None}
    second = invite_token(outbox)

    assert first != second
    stale = api.post(
        ACCEPT, json={"token": first, "new_password": NEW_PASSWORD}
    )
    assert stale.status_code == 400
    fresh = api.post(
        ACCEPT, json={"token": second, "new_password": NEW_PASSWORD}
    )
    assert fresh.status_code == 204


def test_an_explicit_password_on_reset_cancels_the_pending_invite(
    api, db, outbox
):
    _, admin = _studio(db)
    created = api.post(
        TEAM, headers=auth(admin), json={"email": "n@x.com"}
    ).json()
    token = invite_token(outbox)

    r = api.post(
        f"{TEAM}/{created['id']}/reset-password",
        headers=auth(admin),
        json={"password": "handed-over-pass-9"},
    )
    assert r.json()["invite_sent"] is False
    assert len(outbox) == 1  # no second email
    assert _user(db, "n@x.com").invite_pending is False
    stale = api.post(
        ACCEPT, json={"token": token, "new_password": NEW_PASSWORD}
    )
    assert stale.status_code == 400
    login = api.post(
        LOGIN, json={"email": "n@x.com", "password": "handed-over-pass-9"}
    )
    assert login.status_code == 200


def test_reset_without_email_configured_issues_a_temporary_password(
    api, db, outbox, monkeypatch
):
    biz, admin = _studio(db)
    created = api.post(
        TEAM, headers=auth(admin), json={"email": "n@x.com"}
    ).json()
    monkeypatch.setattr(settings, "smtp_host", "")

    r = api.post(
        f"{TEAM}/{created['id']}/reset-password", headers=auth(admin), json={}
    )
    assert r.json()["invite_sent"] is False
    assert len(r.json()["temporary_password"]) >= 12
    assert _user(db, "n@x.com").invite_pending is False


def test_a_failed_resend_is_a_502_and_sends_nothing_new(
    api, db, outbox, monkeypatch
):
    _, admin = _studio(db)
    member = make_user(db, business=admin.business)
    _fail_mail(monkeypatch)
    r = api.post(
        f"{TEAM}/{member.id}/reset-password", headers=auth(admin), json={}
    )
    assert r.status_code == 502
    assert outbox == []


def test_reset_is_audited_as_an_invite(api, db, outbox):
    _, admin = _studio(db)
    member = make_user(db, business=admin.business)
    api.post(
        f"{TEAM}/{member.id}/reset-password", headers=auth(admin), json={}
    )
    entry = db.scalar(
        select(AuditLog).where(AuditLog.action == "team.password_reset")
    )
    assert entry.payload["invited"] is True


def test_the_studio_resend_keeps_the_team_template(api, db, outbox):
    biz, admin = _studio(db, name="SJ Interior DND")
    member = make_user(db, business=biz)
    api.post(
        f"{TEAM}/{member.id}/reset-password", headers=auth(admin), json={}
    )
    assert outbox[0].subject == "SJ Interior DND invites you to join the team"
    assert outbox[0].from_name == "SJ Interior DND"


# -- creating a business ------------------------------------------------


def _create_business(api, superadmin, **extra):
    return api.post(
        BUSINESSES,
        headers=auth(superadmin),
        json={"name": "Fresh Studio", **extra},
    )


def test_a_new_business_admin_gets_the_welcome_from_the_platform(
    api, db, outbox
):
    superadmin = make_user(db, role=UserRole.superadmin)
    r = _create_business(api, superadmin, admin_email="Owner@Fresh.com")
    assert r.status_code == 201
    body = r.json()
    assert body["invite_sent"] is True
    assert body["temporary_password"] is None

    sent = outbox[0]
    assert sent.to == "owner@fresh.com"
    assert sent.subject == "Welcome to Reve8, Fresh Studio"
    assert sent.from_name is None
    assert sent.reply_to is None
    assert sent.html and "Fresh Studio" in sent.html
    assert "Reve8 Pvt Ltd" in sent.body


def test_the_welcome_link_lets_the_admin_set_up_and_sign_in(api, db, outbox):
    superadmin = make_user(db, role=UserRole.superadmin)
    _create_business(api, superadmin, admin_email="owner@fresh.com")
    accepted = api.post(
        ACCEPT,
        json={"token": invite_token(outbox), "new_password": NEW_PASSWORD},
    )
    assert accepted.status_code == 204
    login = api.post(
        LOGIN, json={"email": "owner@fresh.com", "password": NEW_PASSWORD}
    )
    assert login.status_code == 200
    assert login.json()["role"] == "admin"


def test_a_business_without_an_admin_email_sends_nothing(api, db, outbox):
    superadmin = make_user(db, role=UserRole.superadmin)
    r = _create_business(api, superadmin)
    assert r.status_code == 201
    assert r.json()["invite_sent"] is False
    assert outbox == []


def test_an_explicit_admin_password_skips_the_invite_and_is_not_echoed(
    api, db, outbox
):
    superadmin = make_user(db, role=UserRole.superadmin)
    r = _create_business(
        api,
        superadmin,
        admin_email="owner@fresh.com",
        admin_password="handed-over-pass-9",
    )
    assert r.json()["invite_sent"] is False
    assert r.json()["temporary_password"] is None
    assert outbox == []


def test_without_email_a_new_business_gets_a_generated_password(api, db):
    superadmin = make_user(db, role=UserRole.superadmin)
    r = _create_business(api, superadmin, admin_email="owner@fresh.com")
    assert r.json()["invite_sent"] is False
    assert len(r.json()["temporary_password"]) >= 8


def test_a_mail_failure_on_business_create_is_a_502(
    api, db, outbox, monkeypatch
):
    superadmin = make_user(db, role=UserRole.superadmin)
    _fail_mail(monkeypatch)
    r = _create_business(api, superadmin, admin_email="owner@fresh.com")
    assert r.status_code == 502
    assert "down" not in r.text


def test_a_taken_admin_email_sends_nothing(api, db, outbox):
    superadmin = make_user(db, role=UserRole.superadmin)
    taken = make_user(db, email="taken@x.com")
    r = _create_business(api, superadmin, admin_email=taken.email)
    assert r.status_code == 409
    assert outbox == []


def test_the_new_admin_shows_as_pending_in_the_users_list(api, db, outbox):
    superadmin = make_user(db, role=UserRole.superadmin)
    biz_id = _create_business(
        api, superadmin, admin_email="o@fresh.com"
    ).json()["id"]
    users = api.get(f"{BUSINESSES}/{biz_id}/users", headers=auth(superadmin))
    assert [u["invite_pending"] for u in users.json()] == [True]


# -- business-level resend ---------------------------------------------


def _resend(api, biz, who):
    return api.post(f"{BUSINESSES}/{biz.id}/resend-invite", headers=auth(who))


def test_resend_requires_the_platform_admin(api, db, outbox):
    biz, admin = _studio(db)
    assert api.post(f"{BUSINESSES}/{biz.id}/resend-invite").status_code == 401
    assert _resend(api, biz, admin).status_code == 403


def test_resend_for_an_unknown_business_is_a_404(api, db, outbox):
    superadmin = make_user(db, role=UserRole.superadmin)
    r = api.post(
        f"{BUSINESSES}/00000000-0000-0000-0000-000000000000/resend-invite",
        headers=auth(superadmin),
    )
    assert r.status_code == 404


def test_resend_targets_the_admin_who_has_not_set_up_yet(api, db, outbox):
    superadmin = make_user(db, role=UserRole.superadmin)
    biz = make_business(db, name="Fresh Studio")
    done = make_user(db, role=UserRole.admin, business=biz)
    done.last_login_at = datetime.now(timezone.utc)
    waiting = make_user(db, role=UserRole.admin, business=biz)
    waiting.must_change_password = True
    db.flush()

    r = _resend(api, biz, superadmin)

    assert r.status_code == 200
    assert r.json()["email"] == waiting.email
    assert r.json()["invite_sent"] is True
    assert outbox[0].to == waiting.email
    assert outbox[0].subject == "Welcome to Reve8, Fresh Studio"
    assert outbox[0].from_name is None


def test_resend_also_reaches_an_admin_with_a_pending_invite(api, db, outbox):
    superadmin = make_user(db, role=UserRole.superadmin)
    biz_id = _create_business(
        api, superadmin, admin_email="o@fresh.com"
    ).json()["id"]
    biz = db.get(Business, uuid.UUID(biz_id))
    first = invite_token(outbox)

    r = _resend(api, biz, superadmin)

    assert r.status_code == 200
    assert invite_token(outbox) != first
    stale = api.post(
        ACCEPT, json={"token": first, "new_password": NEW_PASSWORD}
    )
    assert stale.status_code == 400


def test_resend_refuses_when_the_admin_already_signed_in(api, db, outbox):
    superadmin = make_user(db, role=UserRole.superadmin)
    biz, admin = _studio(db)
    admin.last_login_at = datetime.now(timezone.utc)
    db.flush()
    r = _resend(api, biz, superadmin)
    assert r.status_code == 409
    assert "already set up" in r.json()["detail"]
    assert outbox == []


def test_resend_ignores_disabled_admins_and_non_admins(api, db, outbox):
    superadmin = make_user(db, role=UserRole.superadmin)
    biz = make_business(db)
    off = make_user(db, role=UserRole.admin, business=biz, is_active=False)
    off.must_change_password = True
    designer = make_user(db, role=UserRole.designer, business=biz)
    designer.must_change_password = True
    db.flush()
    assert _resend(api, biz, superadmin).status_code == 409
    assert outbox == []


def test_resend_without_email_issues_a_one_time_password(api, db):
    superadmin = make_user(db, role=UserRole.superadmin)
    biz = make_business(db)
    admin = make_user(db, role=UserRole.admin, business=biz)
    admin.must_change_password = True
    db.flush()

    r = _resend(api, biz, superadmin)

    assert r.status_code == 200
    assert r.json()["invite_sent"] is False
    assert r.json()["email"] == admin.email
    temp = r.json()["temporary_password"]
    login = api.post(LOGIN, json={"email": admin.email, "password": temp})
    assert login.status_code == 200


def test_a_failed_resend_is_a_502(api, db, outbox, monkeypatch):
    superadmin = make_user(db, role=UserRole.superadmin)
    biz = make_business(db)
    admin = make_user(db, role=UserRole.admin, business=biz)
    admin.must_change_password = True
    db.flush()
    _fail_mail(monkeypatch)
    assert _resend(api, biz, superadmin).status_code == 502


def test_resend_is_audited(api, db, outbox):
    superadmin = make_user(db, role=UserRole.superadmin)
    biz = make_business(db)
    admin = make_user(db, role=UserRole.admin, business=biz)
    admin.must_change_password = True
    db.flush()
    _resend(api, biz, superadmin)
    entry = db.scalar(
        select(AuditLog).where(AuditLog.action == "team.password_reset")
    )
    assert entry.business_id == biz.id
    assert entry.payload["invited"] is True
