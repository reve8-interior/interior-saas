"""Invite email content: wording, escaping, footer and links."""

import pytest

from backend.core.config import settings
from backend.services import email_templates as templates

LINK = "https://portal.reve8.com/accept-invite?token=abc_DEF-123"


@pytest.fixture(autouse=True)
def _branding(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "frontend_url", "https://portal.reve8.com")
    monkeypatch.setattr(
        settings, "smtp_from", "Reve8 Pvt Ltd <hello@reve8.com>"
    )
    monkeypatch.setattr(settings, "invite_ttl_hours", 72)


# -- platform welcome ----------------------------------------------------


def test_welcome_thanks_the_business_and_asks_to_verify():
    mail = templates.platform_welcome("SJ Interior DND", LINK)
    assert mail.subject == "Welcome to Reve8, SJ Interior DND"
    assert "thank you for choosing Reve8" in mail.text
    assert "SJ Interior DND" in mail.text
    assert "Confirm your email and set your password" in mail.text
    assert "Verify email &amp; set password" in mail.html


def test_welcome_lists_the_product_features_in_both_versions():
    mail = templates.platform_welcome("Studio", LINK)
    for feature in templates._FEATURES:
        assert feature in mail.text
        assert feature in mail.html
    assert "What you can do with Reve8" in mail.text


def test_welcome_footer_has_company_site_and_support():
    mail = templates.platform_welcome("Studio", LINK)
    assert "Reve8 Pvt Ltd" in mail.text
    assert "https://portal.reve8.com" in mail.text
    assert "Questions? Write to hello@reve8.com" in mail.text
    assert 'href="https://portal.reve8.com"' in mail.html
    assert 'href="mailto:hello@reve8.com"' in mail.html


def test_the_contact_address_is_the_sender_address(monkeypatch):
    monkeypatch.setattr(settings, "smtp_from", "Acme <help@acme.test>")
    mail = templates.platform_welcome("Studio", LINK)
    assert "Questions? Write to help@acme.test" in mail.text
    assert 'href="mailto:help@acme.test"' in mail.html


def test_footer_falls_back_to_the_product_name_without_a_display_name(
    monkeypatch,
):
    monkeypatch.setattr(settings, "smtp_from", "hello@reve8.com")
    mail = templates.platform_welcome("Studio", LINK)
    footer = mail.text.split("\n--\n")[-1]
    assert footer.splitlines()[0] == "Reve8"
    assert "hello@reve8.com" in footer


def test_footer_omits_the_contact_line_when_nothing_is_configured(
    monkeypatch,
):
    monkeypatch.setattr(settings, "smtp_from", "")
    mail = templates.platform_welcome("Studio", LINK)
    assert "Questions?" not in mail.text
    assert "mailto:" not in mail.html


def test_footer_company_comes_from_the_sender_name_and_site_from_frontend_url(
    monkeypatch,
):
    monkeypatch.setattr(
        settings, "smtp_from", "Acme Software Ltd <a@acme.test>"
    )
    monkeypatch.setattr(settings, "frontend_url", "https://acme.test/")
    mail = templates.platform_welcome("Studio", LINK)
    assert (
        "Acme Software Ltd" in mail.text and "Acme Software Ltd" in mail.html
    )
    # A trailing slash on FRONTEND_URL is not carried into the footer link.
    assert 'href="https://acme.test"' in mail.html
    footer = mail.text.split("\n--\n")[-1]
    assert "portal.reve8.com" not in footer


# -- team invite ---------------------------------------------------------


def test_team_invite_is_from_the_studio_not_the_platform():
    mail = templates.team_invite("SJ Interior DND", LINK)
    assert mail.subject == "SJ Interior DND invites you to join the team"
    assert "SJ Interior DND invites you to join the team." in mail.text
    assert "Accept invite" in mail.html
    assert "choosing Reve8" not in mail.text
    assert "What you can do" not in mail.text
    assert "What you can do" not in mail.html


def test_team_invite_footer_says_it_was_sent_on_the_studios_behalf():
    mail = templates.team_invite("SJ Interior DND", LINK)
    assert "Sent via Reve8" in mail.text
    assert "Sent on behalf of SJ Interior DND" in mail.html


# -- both ---------------------------------------------------------------


@pytest.mark.parametrize(
    "build", [templates.platform_welcome, templates.team_invite]
)
def test_link_appears_unmangled_in_text_and_html(build):
    mail = build("Studio", LINK)
    assert LINK in mail.text
    # In HTML it is both the button target and the paste-in fallback.
    assert mail.html.count(LINK) == 2


@pytest.mark.parametrize(
    "build", [templates.platform_welcome, templates.team_invite]
)
def test_expiry_and_ignore_notice_use_the_configured_ttl(build, monkeypatch):
    monkeypatch.setattr(settings, "invite_ttl_hours", 24)
    mail = build("Studio", LINK)
    assert "expires in 24 hours" in mail.text
    assert "expires in 24 hours" in mail.html
    assert "you can ignore it" in mail.text


@pytest.mark.parametrize(
    "build", [templates.platform_welcome, templates.team_invite]
)
def test_business_names_are_escaped_in_html(build):
    mail = build('<script>alert("x")</script> & Co', LINK)
    assert "<script>" not in mail.html
    assert "&lt;script&gt;" in mail.html
    assert "&amp; Co" in mail.html
    # Plain text is not HTML, so the name stays literal there.
    assert "<script>" in mail.text


@pytest.mark.parametrize(
    "build", [templates.platform_welcome, templates.team_invite]
)
def test_link_is_escaped_in_html_attributes(build):
    hostile = 'https://x.test/a?t=1"><img src=x onerror=alert(1)>'
    mail = build("Studio", hostile)
    assert '"><img' not in mail.html
    assert "&quot;&gt;&lt;img" in mail.html


@pytest.mark.parametrize(
    "build", [templates.platform_welcome, templates.team_invite]
)
def test_html_is_a_complete_document_with_inline_styles_only(build):
    html = build("Studio", LINK).html
    assert html.startswith("<!doctype html>")
    assert html.rstrip().endswith("</html>")
    assert "<style" not in html and "<script" not in html
    assert "stylesheet" not in html
