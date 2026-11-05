"""Plain SMTP sender. Kept dependency-free; swap the body for an API client
(Resend, SES) without touching callers."""

import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, parseaddr

from ..core.config import settings
from ..core.logging import logger

_TIMEOUT_S = 15


class MailError(Exception):
    """The message could not be handed to the mail server."""


def _sender(display_name: str | None) -> str:
    """The verified SMTP_FROM address, optionally under another display name.

    Only the name changes: mail claiming another domain would fail SPF/DKIM.
    """
    default_name, address = parseaddr(settings.smtp_from)
    name = " ".join((display_name or default_name).split())
    return formataddr((name, address)) if name else address


def send_email(
    to: str,
    subject: str,
    body: str,
    *,
    html: str | None = None,
    from_name: str | None = None,
    reply_to: str | None = None,
) -> None:
    message = EmailMessage()
    message["From"] = _sender(from_name)
    if reply_to:
        message["Reply-To"] = reply_to
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    if html:
        message.add_alternative(html, subtype="html")
    try:
        # Port 465 is implicit TLS; everything else upgrades with STARTTLS.
        if settings.smtp_port == 465:
            client: smtplib.SMTP = smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                timeout=_TIMEOUT_S,
                context=ssl.create_default_context(),
            )
        else:
            client = smtplib.SMTP(
                settings.smtp_host, settings.smtp_port, timeout=_TIMEOUT_S
            )
        with client:
            if settings.smtp_port != 465 and settings.smtp_starttls:
                client.starttls(context=ssl.create_default_context())
            if settings.smtp_user:
                client.login(settings.smtp_user, settings.smtp_password)
            client.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        logger.error("email_send_failed", error=type(exc).__name__)
        raise MailError("Could not send email") from exc
