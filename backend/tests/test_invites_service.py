"""Invite tokens: hashing, expiry, single use and failure behaviour."""

import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from backend.core.config import settings
from backend.core.security import verify_password
from backend.models.user import UserRole
from backend.services import invites, mailer

from .conftest import PASSWORD, invite_token, make_business, make_user


def _invited_user(db, outbox, **kw):
    user = make_user(db, **kw)
    invites.issue_invite(user, "Acme Interiors")
    db.flush()  # the session does not autoflush; accept_invite queries by hash
    return user, invite_token(outbox)


# -- issuing -----------------------------------------------------------


def test_only_a_hash_of_the_token_is_stored(db, outbox):
    user, token = _invited_user(db, outbox)
    assert user.invite_token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert token not in (user.invite_token_hash or "")
    assert len(user.invite_token_hash) == 64


def test_tokens_are_long_unique_and_url_safe(db, outbox):
    _, first = _invited_user(db, outbox)
    _, second = _invited_user(db, outbox)
    assert first != second
    assert len(first) >= 40
    assert all(c.isalnum() or c in "-_" for c in first)


def test_expiry_follows_the_configured_lifetime(db, outbox, monkeypatch):
    monkeypatch.setattr(settings, "invite_ttl_hours", 5)
    user, _ = _invited_user(db, outbox)
    expected = datetime.now(timezone.utc) + timedelta(hours=5)
    assert abs(user.invite_expires_at - expected) < timedelta(minutes=1)


def test_link_uses_the_frontend_url_without_a_double_slash(
    db, outbox, monkeypatch
):
    monkeypatch.setattr(settings, "frontend_url", "https://app.test/")
    _invited_user(db, outbox)
    assert "https://app.test/accept-invite?token=" in outbox[-1].body
    assert "https://app.test//" not in outbox[-1].body


def test_a_business_less_invite_still_reads_naturally(db, outbox):
    user = make_user(db)
    invites.issue_invite(user, None)
    assert "your team" in outbox[-1].subject


def test_reissuing_invalidates_the_previous_link(db, outbox):
    user = make_user(db)
    invites.issue_invite(user, "Acme")
    first = invite_token(outbox)
    invites.issue_invite(user, "Acme")
    second = invite_token(outbox)
    db.flush()
    assert first != second
    with pytest.raises(HTTPException) as old:
        invites.accept_invite(db, first, "a-new-password-1")
    assert old.value.status_code == 400
    assert invites.accept_invite(db, second, "a-new-password-1") is user


def test_send_failure_is_a_502_without_provider_details(
    db, outbox, monkeypatch
):
    def refuse(*args, **kwargs):
        raise mailer.MailError("550 mailbox unavailable at smtp.secret.host")

    monkeypatch.setattr(invites, "send_email", refuse)
    with pytest.raises(HTTPException) as caught:
        invites.issue_invite(make_user(db), "Acme")
    assert caught.value.status_code == 502
    assert "smtp.secret.host" not in caught.value.detail


# -- accepting ---------------------------------------------------------


def test_accepting_sets_the_password_and_marks_the_email_verified(db, outbox):
    user, token = _invited_user(db, outbox, must_change_password=True)
    before = datetime.now(timezone.utc)

    returned = invites.accept_invite(db, token, "my-chosen-pass-1")

    assert returned is user
    assert verify_password("my-chosen-pass-1", user.password_hash)
    assert not verify_password(PASSWORD, user.password_hash)
    assert user.must_change_password is False
    assert user.email_verified_at is not None
    assert user.email_verified_at >= before - timedelta(seconds=1)
    assert user.invite_token_hash is None
    assert user.invite_expires_at is None
    assert user.invite_pending is False


def test_a_token_works_once(db, outbox):
    _, token = _invited_user(db, outbox)
    invites.accept_invite(db, token, "my-chosen-pass-1")
    with pytest.raises(HTTPException) as again:
        invites.accept_invite(db, token, "another-pass-22")
    assert again.value.status_code == 400
    assert again.value.detail == invites.INVALID_INVITE


def test_an_expired_token_is_refused_and_changes_nothing(db, outbox):
    user, token = _invited_user(db, outbox)
    original_hash = user.password_hash
    user.invite_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.flush()

    with pytest.raises(HTTPException) as caught:
        invites.accept_invite(db, token, "my-chosen-pass-1")

    assert caught.value.status_code == 400
    assert user.password_hash == original_hash
    assert user.email_verified_at is None


def test_a_token_without_an_expiry_is_refused(db, outbox):
    user, token = _invited_user(db, outbox)
    user.invite_expires_at = None
    db.flush()
    with pytest.raises(HTTPException):
        invites.accept_invite(db, token, "my-chosen-pass-1")


@pytest.mark.parametrize(
    "bad",
    ["", "x", "not-a-real-token-at-all-0123456789", " ", "A" * 43],
)
def test_unknown_tokens_get_the_same_generic_error(db, outbox, bad):
    _invited_user(db, outbox)
    with pytest.raises(HTTPException) as caught:
        invites.accept_invite(db, bad, "my-chosen-pass-1")
    assert caught.value.status_code == 400
    assert caught.value.detail == invites.INVALID_INVITE


def test_a_near_miss_token_does_not_work(db, outbox):
    _, token = _invited_user(db, outbox)
    flipped = ("A" if token[0] != "A" else "B") + token[1:]
    with pytest.raises(HTTPException):
        invites.accept_invite(db, flipped, "my-chosen-pass-1")


def test_a_token_only_ever_unlocks_its_own_user(db, outbox):
    biz = make_business(db)
    first, token = _invited_user(db, outbox, business=biz)
    second, _ = _invited_user(db, outbox, business=biz)
    second_hash = second.password_hash

    assert invites.accept_invite(db, token, "my-chosen-pass-1") is first
    assert second.password_hash == second_hash
    assert second.email_verified_at is None
    assert second.invite_pending is True


def test_accepting_does_not_change_role_or_activity(db, outbox):
    user, token = _invited_user(db, outbox, role=UserRole.viewer)
    user.is_active = False
    db.flush()
    invites.accept_invite(db, token, "my-chosen-pass-1")
    assert user.role == UserRole.viewer
    assert user.is_active is False


# -- placeholder password ----------------------------------------------


def test_unusable_password_hash_matches_nothing_guessable():
    first, second = (
        invites.unusable_password_hash(),
        invites.unusable_password_hash(),
    )
    assert first != second
    for guess in ("", "password", PASSWORD, "changeme", first):
        assert not verify_password(guess, first)
