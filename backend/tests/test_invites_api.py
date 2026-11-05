"""Email invites: one-time link sets the password and verifies the email."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from backend.core.config import settings
from backend.models.user import User, UserRole
from backend.services import invites, mailer

from .conftest import auth, make_business, make_user
from .conftest import invite_token as _token

TEAM = "/api/v1/team"
ACCEPT = "/api/v1/auth/accept-invite"
LOGIN = "/api/v1/auth/login"


def _admin(db):
    biz = make_business(db, plan="studio_pro")
    return make_user(db, role=UserRole.admin, business=biz)


def test_member_without_password_is_invited_by_email(api, db, outbox):
    admin = _admin(db)
    r = api.post(
        TEAM,
        headers=auth(admin),
        json={"email": "New@X.com", "role": "designer"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["invite_sent"] is True
    assert body["invite_pending"] is True
    assert body["temporary_password"] is None
    assert outbox[0][0] == "new@x.com"


def test_accept_invite_sets_password_and_verifies_email(api, db, outbox):
    admin = _admin(db)
    api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    token = _token(outbox)

    r = api.post(
        ACCEPT, json={"token": token, "new_password": "my-new-pass-1"}
    )
    assert r.status_code == 204

    user = db.scalar(select(User).where(User.email == "n@x.com"))
    db.refresh(user)
    assert user.email_verified_at is not None
    assert user.must_change_password is False
    assert user.invite_token_hash is None
    login = api.post(
        LOGIN, json={"email": "n@x.com", "password": "my-new-pass-1"}
    )
    assert login.status_code == 200


def test_invite_token_is_single_use(api, db, outbox):
    admin = _admin(db)
    api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    token = _token(outbox)
    body = {"token": token, "new_password": "my-new-pass-1"}
    assert api.post(ACCEPT, json=body).status_code == 204
    assert api.post(ACCEPT, json=body).status_code == 400


def test_expired_or_unknown_token_is_rejected(api, db, outbox):
    admin = _admin(db)
    api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    token = _token(outbox)
    user = db.scalar(select(User).where(User.email == "n@x.com"))
    user.invite_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.flush()

    expired = api.post(
        ACCEPT, json={"token": token, "new_password": "my-new-pass-1"}
    )
    assert expired.status_code == 400
    unknown = api.post(
        ACCEPT, json={"token": "x" * 43, "new_password": "my-new-pass-1"}
    )
    assert unknown.status_code == 400


def test_invited_account_cannot_sign_in_before_accepting(api, db, outbox):
    admin = _admin(db)
    api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    r = api.post(LOGIN, json={"email": "n@x.com", "password": "anything-1234"})
    assert r.status_code == 401


def test_explicit_password_skips_the_invite(api, db, outbox):
    admin = _admin(db)
    r = api.post(
        TEAM,
        headers=auth(admin),
        json={"email": "n@x.com", "password": "temp-pass-123"},
    )
    assert r.status_code == 201
    assert r.json()["invite_sent"] is False
    assert outbox == []


def test_without_email_configured_a_password_is_generated(api, db):
    admin = _admin(db)
    r = api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    assert r.status_code == 201
    assert r.json()["invite_sent"] is False
    assert len(r.json()["temporary_password"]) >= 8


def test_reset_password_resends_invite_when_email_enabled(api, db, outbox):
    biz = make_business(db, plan="studio_pro")
    admin = make_user(db, role=UserRole.admin, business=biz)
    member = make_user(db, business=biz)
    r = api.post(
        f"{TEAM}/{member.id}/reset-password", headers=auth(admin), json={}
    )
    assert r.status_code == 200
    assert r.json() == {"invite_sent": True, "temporary_password": None}
    assert outbox[0][0] == member.email


def test_mail_failure_creates_no_account(api, db, outbox, monkeypatch):
    def boom(to: str, subject: str, body: str, **kw: str | None) -> None:
        raise mailer.MailError("down")

    monkeypatch.setattr(invites, "send_email", boom)
    admin = _admin(db)
    r = api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    assert r.status_code == 502
    assert db.scalar(select(User).where(User.email == "n@x.com")) is None


def test_business_admin_without_password_is_invited(api, db, outbox):
    superadmin = make_user(db, role=UserRole.superadmin)
    r = api.post(
        "/api/v1/businesses",
        headers=auth(superadmin),
        json={"name": "Invited Studio", "admin_email": "owner@x.com"},
    )
    assert r.status_code == 201
    assert r.json()["invite_sent"] is True
    assert r.json()["temporary_password"] is None
    assert outbox[0][0] == "owner@x.com"
    assert "Invited Studio" in outbox[0][2]


def test_invite_comes_from_the_business_with_replies_to_the_sender(
    api, db, monkeypatch
):
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_from", "Reve8 <noreply@test.com>")
    captured: dict = {}
    monkeypatch.setattr(
        invites, "send_email", lambda *a, **kw: captured.update(kw)
    )
    admin = _admin(db)
    api.post(TEAM, headers=auth(admin), json={"email": "n@x.com"})
    assert captured["from_name"] == admin.business.name
    assert captured["reply_to"] == admin.email


def test_sender_keeps_the_verified_address_but_swaps_the_name(monkeypatch):
    monkeypatch.setattr(settings, "smtp_from", "Reve8 <noreply@test.com>")
    header = mailer._sender("Acme\r\nBcc: x@y.com")
    assert "\n" not in header and "\r" not in header
    assert header.endswith("<noreply@test.com>")
    assert mailer._sender(None) == "Reve8 <noreply@test.com>"


def test_business_onboarding_invite_comes_from_the_platform(
    api, db, monkeypatch
):
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_from", "Reve8 <noreply@test.com>")
    captured: dict = {}
    monkeypatch.setattr(
        invites, "send_email", lambda *a, **kw: captured.update(kw)
    )
    superadmin = make_user(db, role=UserRole.superadmin)
    api.post(
        "/api/v1/businesses",
        headers=auth(superadmin),
        json={"name": "Invited Studio", "admin_email": "owner@x.com"},
    )
    assert captured["from_name"] is None


def test_platform_welcome_email_content(monkeypatch):
    from backend.services import email_templates

    monkeypatch.setattr(settings, "smtp_from", "Reve8 <hello@reve8.com>")
    monkeypatch.setattr(settings, "frontend_url", "https://portal.reve8.com")
    mail = email_templates.platform_welcome("SJ <Interior>", "http://x/a?t=1")
    assert mail.subject.startswith("Welcome to Reve8")
    assert "thank you for choosing Reve8" in mail.text
    assert "http://x/a?t=1" in mail.text and "http://x/a?t=1" in mail.html
    assert "hello@reve8.com" in mail.text
    assert "portal.reve8.com" in mail.html
    assert "hello@reve8.com" in mail.html
    # Business names are untrusted: HTML must be escaped.
    assert "SJ <Interior>" not in mail.html
    assert "SJ &lt;Interior&gt;" in mail.html


def test_team_invite_email_content():
    from backend.services import email_templates

    mail = email_templates.team_invite("SJ Interior DND", "http://x/a?t=1")
    assert mail.subject == "SJ Interior DND invites you to join the team"
    assert "SJ Interior DND invites you to join the team." in mail.text
    assert "Accept invite" in mail.html
    assert "choosing Reve8" not in mail.text


def test_html_alternative_is_attached(monkeypatch):
    sent = []

    class FakeSMTP:
        def __init__(self, *a, **kw): ...
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self, **kw): ...
        def login(self, *a): ...
        def send_message(self, message):
            sent.append(message)

    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_from", "Reve8 <a@test.com>")
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    mailer.send_email("t@x.com", "Hi", "plain", html="<b>rich</b>")
    kinds = [part.get_content_type() for part in sent[0].iter_parts()]
    assert kinds == ["text/plain", "text/html"]


def test_platform_resend_to_business_admin_uses_the_welcome_email(
    api, db, monkeypatch
):
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_from", "Reve8 <noreply@test.com>")
    subjects: list[str] = []
    monkeypatch.setattr(
        invites,
        "send_email",
        lambda to, subject, *a, **kw: subjects.append(subject),
    )
    biz = make_business(db, name="SJ Interior DND", plan="studio_pro")
    owner = make_user(db, role=UserRole.admin, business=biz)
    designer = make_user(db, role=UserRole.designer, business=biz)
    superadmin = make_user(db, role=UserRole.superadmin)
    base = f"/api/v1/businesses/{biz.id}/users"

    # A studio admin resending to their own member is the team invite.
    r = api.post(
        f"{TEAM}/{designer.id}/reset-password", headers=auth(owner), json={}
    )
    assert r.status_code == 200, r.text
    assert subjects[-1] == "SJ Interior DND invites you to join the team"
    # The platform resending to the studio's admin is the welcome email.
    api.post(
        f"{base}/{owner.id}/reset-password", headers=auth(superadmin), json={}
    )
    assert subjects[-1] == "Welcome to Reve8, SJ Interior DND"


def test_resend_invite_for_a_business_reaches_its_pending_admin(
    api, db, outbox
):
    superadmin = make_user(db, role=UserRole.superadmin)
    biz = make_business(db, name="Fresh Studio")
    owner = make_user(db, role=UserRole.admin, business=biz)
    owner.must_change_password = True
    db.flush()
    url = f"/api/v1/businesses/{biz.id}/resend-invite"

    r = api.post(url, headers=auth(superadmin))
    assert r.status_code == 200
    assert r.json() == {
        "invite_sent": True,
        "temporary_password": None,
        "email": owner.email,
    }
    assert outbox[-1][1] == "Welcome to Reve8, Fresh Studio"
    assert api.post(url, headers=auth(owner)).status_code == 403


def test_resend_invite_refuses_when_the_admin_already_set_up(api, db, outbox):
    superadmin = make_user(db, role=UserRole.superadmin)
    biz = make_business(db)
    owner = make_user(db, role=UserRole.admin, business=biz)
    owner.last_login_at = datetime.now(timezone.utc)
    db.flush()
    r = api.post(
        f"/api/v1/businesses/{biz.id}/resend-invite", headers=auth(superadmin)
    )
    assert r.status_code == 409
    assert outbox == []
