"""Invite email content. Plain text plus a simple table-based HTML version
(inline styles only, the one thing mail clients reliably support)."""

from dataclasses import dataclass
from email.utils import parseaddr
from html import escape

from ..core.config import settings

_BRAND = "#1e4fd6"
_FEATURES = (
    "Keep every client, conversation and project in one place",
    "Turn your materials and margins into quotations in minutes",
    "Share designs and progress with clients, on a portfolio site of your own",
    "Let AI turn meeting notes into structured updates",
)


@dataclass(frozen=True)
class Email:
    subject: str
    text: str
    html: str


def _company() -> str:
    """The sender's display name from SMTP_FROM, e.g. "Reve8 Pvt Ltd"."""
    return parseaddr(settings.smtp_from)[0] or "Reve8"


def _website() -> str:
    return settings.frontend_url.rstrip("/")


def _support_email() -> str:
    """Where questions go: the SMTP_FROM address."""
    return parseaddr(settings.smtp_from)[1]


def _footer_text() -> str:
    lines = [_company(), _website()]
    if support := _support_email():
        lines.append(f"Questions? Write to {support}")
    return "\n".join(lines)


def _page(
    heading: str,
    paragraphs: list[str],
    button: str,
    link: str,
    extra_html: str,
    note: str,
    footer: str,
) -> str:
    body = "".join(
        f'<p style="margin:0 0 16px;font-size:15px;line-height:1.6;'
        f'color:#334155">{escape(p)}</p>'
        for p in paragraphs
    )
    return f"""<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:#f1f5f9;\
font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
<tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" \
style="max-width:560px;width:100%;background:#ffffff;border-radius:12px">
<tr><td style="padding:32px 32px 8px">
<h1 style="margin:0 0 16px;font-size:22px;color:#0f172a">{escape(heading)}</h1>
{body}
<p style="margin:24px 0">
<a href="{escape(link)}" style="display:inline-block;padding:12px 22px;\
background:{_BRAND};color:#ffffff;text-decoration:none;border-radius:8px;\
font-weight:bold;font-size:15px">{escape(button)}</a></p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#64748b">\
{escape(note)}<br>Button not working? Paste this link into your browser:<br>
<span style="word-break:break-all">{escape(link)}</span></p>
{extra_html}
</td></tr>
<tr><td style="padding:16px 32px 28px;border-top:1px solid #e2e8f0;\
font-size:12px;line-height:1.6;color:#64748b">{footer}</td></tr>
</table></td></tr></table></body></html>"""


def _footer_html() -> str:
    parts = [
        f"<strong>{escape(_company())}</strong>",
        f'<a href="{escape(_website())}" '
        f'style="color:{_BRAND}">{escape(_website())}</a>',
    ]
    if support := _support_email():
        parts.append(
            f'Questions? <a href="mailto:{escape(support)}" '
            f'style="color:{_BRAND}">{escape(support)}</a>'
        )
    return "<br>".join(parts)


def _expiry_note() -> str:
    return (
        f"This link works once and expires in {settings.invite_ttl_hours} "
        "hours. If you were not expecting this email, you can ignore it."
    )


def platform_welcome(business_name: str, link: str) -> Email:
    """Sent when the platform creates a business: welcome plus first login."""
    features_html = (
        '<p style="margin:24px 0 8px;font-size:14px;font-weight:bold;'
        'color:#0f172a">What you can do with Reve8</p>'
        '<ul style="margin:0 0 8px;padding-left:20px;font-size:14px;'
        'line-height:1.7;color:#334155">'
        + "".join(f"<li>{escape(f)}</li>" for f in _FEATURES)
        + "</ul>"
    )
    intro = (
        f"Welcome, and thank you for choosing Reve8 to grow {business_name}. "
        "Your studio account is ready."
    )
    ask = "Confirm your email and set your password to get started:"
    text = (
        f"{intro}\n\n{ask}\n{link}\n\n"
        "What you can do with Reve8:\n"
        + "\n".join(f"- {f}" for f in _FEATURES)
        + f"\n\n{_expiry_note()}\n\n--\n{_footer_text()}"
    )
    html = _page(
        f"Welcome to Reve8, {business_name}",
        [intro, ask],
        "Verify email & set password",
        link,
        features_html,
        _expiry_note(),
        _footer_html(),
    )
    return Email(f"Welcome to Reve8, {business_name}", text, html)


def team_invite(business_name: str, link: str) -> Email:
    """Sent by a studio admin to a new team member."""
    intro = f"{business_name} invites you to join the team."
    ask = "Confirm your email and set your password to get started:"
    text = (
        f"{intro}\n\n{ask}\n{link}\n\n{_expiry_note()}\n\n--\nSent via Reve8"
    )
    footer = (
        f"Sent on behalf of {escape(business_name)} via "
        f'<a href="{escape(_website())}" '
        f'style="color:{_BRAND}">Reve8</a>.'
    )
    html = _page(
        f"Join {business_name} on Reve8",
        [intro, ask],
        "Accept invite",
        link,
        "",
        _expiry_note(),
        footer,
    )
    return Email(f"{business_name} invites you to join the team", text, html)
