"""SMTP sender: transport choice, credentials, headers and failure handling."""

import smtplib

import pytest

from backend.core.config import Settings, settings
from backend.services import mailer


class FakeSMTP:
    """Stands in for smtplib.SMTP and records what was done to it."""

    def __init__(
        self, host: str, port: int, timeout: float | None = None, context=None
    ) -> None:
        self.host = host
        self.port = port
        self.timeout = timeout
        self.context = context
        self.tls_started = False
        self.credentials: tuple[str, str] | None = None
        self.messages: list = []

    def __enter__(self) -> "FakeSMTP":
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def starttls(self, context=None) -> None:
        self.tls_started = True

    def login(self, user: str, password: str) -> None:
        self.credentials = (user, password)

    def send_message(self, message) -> None:
        self.messages.append(message)


class FakeSMTPSSL(FakeSMTP):
    """Marks the implicit-TLS transport used on port 465."""


@pytest.fixture
def smtp(monkeypatch: pytest.MonkeyPatch) -> list[FakeSMTP]:
    """Configure SMTP and capture every connection opened."""
    made: list[FakeSMTP] = []

    def track(cls: type[FakeSMTP]):
        def factory(*args, **kwargs) -> FakeSMTP:
            conn = cls(*args, **kwargs)
            made.append(conn)
            return conn

        return factory

    monkeypatch.setattr(mailer.smtplib, "SMTP", track(FakeSMTP))
    monkeypatch.setattr(mailer.smtplib, "SMTP_SSL", track(FakeSMTPSSL))
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_user", "resend")
    monkeypatch.setattr(settings, "smtp_password", "key-123")
    monkeypatch.setattr(settings, "smtp_from", "Reve8 Pvt Ltd <hi@reve8.com>")
    monkeypatch.setattr(settings, "smtp_starttls", True)
    return made


# -- transport ----------------------------------------------------------


def test_port_587_upgrades_with_starttls_then_logs_in(smtp):
    mailer.send_email("to@x.com", "Hi", "body")
    (conn,) = smtp
    assert type(conn) is FakeSMTP
    assert (conn.host, conn.port) == ("smtp.test", 587)
    assert conn.tls_started is True
    assert conn.credentials == ("resend", "key-123")
    assert len(conn.messages) == 1


def test_port_465_uses_implicit_tls_and_skips_starttls(smtp, monkeypatch):
    monkeypatch.setattr(settings, "smtp_port", 465)
    mailer.send_email("to@x.com", "Hi", "body")
    (conn,) = smtp
    assert isinstance(conn, FakeSMTPSSL)
    assert conn.tls_started is False
    assert conn.credentials == ("resend", "key-123")


def test_starttls_can_be_switched_off_for_a_local_mail_catcher(
    smtp, monkeypatch
):
    monkeypatch.setattr(settings, "smtp_starttls", False)
    mailer.send_email("to@x.com", "Hi", "body")
    assert smtp[0].tls_started is False


def test_no_login_without_a_username(smtp, monkeypatch):
    monkeypatch.setattr(settings, "smtp_user", "")
    mailer.send_email("to@x.com", "Hi", "body")
    assert smtp[0].credentials is None


def test_connection_has_a_timeout(smtp):
    mailer.send_email("to@x.com", "Hi", "body")
    assert smtp[0].timeout == mailer._TIMEOUT_S


# -- message ------------------------------------------------------------


def test_headers_use_the_verified_address_and_given_names(smtp):
    mailer.send_email(
        "to@x.com",
        "Subject line",
        "body",
        from_name="Acme Interiors",
        reply_to="owner@acme.com",
    )
    message = smtp[0].messages[0]
    assert message["To"] == "to@x.com"
    assert message["Subject"] == "Subject line"
    assert message["From"] == "Acme Interiors <hi@reve8.com>"
    assert message["Reply-To"] == "owner@acme.com"


def test_defaults_to_the_platform_name_and_no_reply_to(smtp):
    mailer.send_email("to@x.com", "Hi", "body")
    message = smtp[0].messages[0]
    assert message["From"] == "Reve8 Pvt Ltd <hi@reve8.com>"
    assert message["Reply-To"] is None


def test_plain_text_only_when_no_html_is_given(smtp):
    mailer.send_email("to@x.com", "Hi", "plain body")
    message = smtp[0].messages[0]
    assert message.get_content_type() == "text/plain"
    assert "plain body" in message.get_content()


def test_html_is_added_as_an_alternative_after_the_text(smtp):
    mailer.send_email("to@x.com", "Hi", "plain body", html="<b>rich</b>")
    message = smtp[0].messages[0]
    assert message.get_content_type() == "multipart/alternative"
    kinds = [part.get_content_type() for part in message.iter_parts()]
    assert kinds == ["text/plain", "text/html"]
    html_part = list(message.iter_parts())[1]
    assert "<b>rich</b>" in html_part.get_content()


# -- sender display name ------------------------------------------------


@pytest.mark.parametrize(
    ("configured", "name", "expected"),
    [
        ("Reve8 <a@test.com>", None, "Reve8 <a@test.com>"),
        ("Reve8 <a@test.com>", "Acme", "Acme <a@test.com>"),
        ("a@test.com", None, "a@test.com"),
        ("a@test.com", "Acme", "Acme <a@test.com>"),
        ("a@test.com", "  Acme   Interiors  ", "Acme Interiors <a@test.com>"),
    ],
)
def test_sender_keeps_the_verified_address_and_only_swaps_the_name(
    monkeypatch, configured, name, expected
):
    monkeypatch.setattr(settings, "smtp_from", configured)
    assert mailer._sender(name) == expected


def test_sender_never_carries_line_breaks(monkeypatch):
    monkeypatch.setattr(settings, "smtp_from", "Reve8 <a@test.com>")
    header = mailer._sender("Acme\r\nBcc: victim@x.com")
    assert "\r" not in header and "\n" not in header
    assert header.endswith("<a@test.com>")


def test_sender_cannot_be_pointed_at_another_domain(monkeypatch):
    monkeypatch.setattr(settings, "smtp_from", "Reve8 <a@test.com>")
    header = mailer._sender("evil@bad.com")
    assert header.endswith("<a@test.com>")
    assert header.count("@") == 2  # the name text plus the real address only


# -- failures -----------------------------------------------------------


@pytest.mark.parametrize(
    "error",
    [
        smtplib.SMTPDataError(550, b"rejected"),
        smtplib.SMTPAuthenticationError(535, b"bad creds"),
        smtplib.SMTPServerDisconnected("gone"),
        ConnectionRefusedError("nothing listening"),
        TimeoutError("slow"),
    ],
)
def test_transport_failures_become_a_single_mail_error(
    smtp, monkeypatch, error
):
    def boom(self, message) -> None:
        raise error

    monkeypatch.setattr(FakeSMTP, "send_message", boom)
    with pytest.raises(mailer.MailError) as caught:
        mailer.send_email("to@x.com", "Hi", "body")
    # Provider details and credentials never leak into the message.
    assert "key-123" not in str(caught.value)
    assert "rejected" not in str(caught.value)


def test_a_failed_connection_is_a_mail_error(monkeypatch):
    def refuse(*args, **kwargs):
        raise ConnectionRefusedError("no route")

    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_from", "a@test.com")
    monkeypatch.setattr(mailer.smtplib, "SMTP", refuse)
    with pytest.raises(mailer.MailError):
        mailer.send_email("to@x.com", "Hi", "body")


# -- configuration ------------------------------------------------------


def test_email_is_enabled_only_with_both_host_and_sender():
    def build(**env: str) -> Settings:
        return Settings(_env_file=None, **env)

    assert build().email_enabled is False
    assert build(SMTP_HOST="smtp.test").email_enabled is False
    assert build(SMTP_FROM="a@test.com").email_enabled is False
    assert build(SMTP_HOST="h", SMTP_FROM="a@test.com").email_enabled is True


def test_email_defaults_are_safe():
    cfg = Settings(_env_file=None)
    assert cfg.smtp_port == 587
    assert cfg.smtp_starttls is True
    assert cfg.invite_ttl_hours == 72
