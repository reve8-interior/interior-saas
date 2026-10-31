"""
"Needs attention" feed for the dashboard: things a designer should act on.

Each item points at one client and one place to go. Everything is scoped to
clients the caller may see, so a designer never learns about someone else's.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..models.attention_read import AttentionRead
from ..models.client import Client
from ..models.quotation import Quotation
from ..models.quotation_message import QuotationMessage
from ..models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from ..models.quotation_version import QuotationShare, QuotationVersion
from ..models.user import User
from ..schemas.dashboard import AttentionItem, AttentionKind
from .client_access import restrict_to_accessible

# A reply older than this is history, not an alert.
REPLY_WINDOW = timedelta(days=14)
# Links ending within this window are worth renewing.
EXPIRY_WINDOW = timedelta(days=3)


def _active_share_rows(db: Session, user: User, now: datetime):
    q = (
        select(QuotationShare, QuotationVersion, Client)
        .join(
            QuotationVersion, QuotationShare.version_id == QuotationVersion.id
        )
        .join(Quotation, QuotationVersion.quotation_id == Quotation.id)
        .join(Client, Quotation.client_id == Client.id)
        .where(Client.is_active.is_(True))
    )
    return db.execute(restrict_to_accessible(q, user)), now


def get_attention_items(
    db: Session, user: User, now: datetime | None = None
) -> list[AttentionItem]:
    """Customer replies, expiring links and unclear rows, most urgent first."""
    now = now or datetime.now(timezone.utc)
    items: list[AttentionItem] = []

    rows, _ = _active_share_rows(db, user, now)
    for share, version, client in rows:
        if share.revoked_at is not None:
            continue
        if (
            share.response_kind == "approved"
            and share.responded_at
            and share.responded_at >= now - REPLY_WINDOW
        ):
            who = share.response_name or "Customer"
            items.append(
                AttentionItem(
                    kind=AttentionKind.customer_approved,
                    client_id=client.id,
                    client_name=client.name,
                    title=f"{who} approved version {version.number}",
                    detail=share.response_message,
                    at=share.responded_at,
                    path=(
                        f"/dashboard/clients/{client.id}/versions"
                        f"?view=1&version={version.id}"
                    ),
                    key=(
                        f"{share.response_kind}:{share.id}:"
                        f"{share.responded_at.isoformat()}"
                    ),
                )
            )
        elif (
            share.expires_at and now < share.expires_at <= now + EXPIRY_WINDOW
        ):
            items.append(
                AttentionItem(
                    kind=AttentionKind.link_expiring,
                    client_id=client.id,
                    client_name=client.name,
                    title=f"Link to version {version.number} expires soon",
                    detail=None,
                    at=share.expires_at,
                    path=(
                        f"/dashboard/clients/{client.id}/versions"
                        f"?view=1&version={version.id}"
                    ),
                    key=f"expiring:{share.id}:{share.expires_at.isoformat()}",
                )
            )

    # Every unresolved question counts, however old or however many came
    # after it: the bell stays lit until a designer resolves it.
    open_questions = (
        select(QuotationMessage, Client)
        .join(Quotation, QuotationMessage.quotation_id == Quotation.id)
        .join(Client, Quotation.client_id == Client.id)
        .where(
            Client.is_active.is_(True),
            QuotationMessage.kind == "question",
            QuotationMessage.resolved_at.is_(None),
        )
    )
    for message, client in db.execute(
        restrict_to_accessible(open_questions, user)
    ):
        items.append(
            AttentionItem(
                kind=AttentionKind.customer_question,
                client_id=client.id,
                client_name=client.name,
                title=(
                    f"{message.name} asked a question "
                    f"(version {message.version_number})"
                ),
                detail=message.message,
                at=message.created_at,
                path=f"/dashboard/clients/{client.id}#customer-messages",
                key=f"question:{message.id}",
            )
        )

    unclear = (
        select(Client, func.count(QuotationLineItem.id))
        .join(Quotation, Quotation.client_id == Client.id)
        .join(
            QuotationLineItem, QuotationLineItem.quotation_id == Quotation.id
        )
        .where(
            Client.is_active.is_(True),
            QuotationLineItem.status == QuotationItemStatus.pending_clarity,
        )
        .group_by(Client.id)
    )
    for client, count in db.execute(restrict_to_accessible(unclear, user)):
        items.append(
            AttentionItem(
                kind=AttentionKind.needs_clarity,
                client_id=client.id,
                client_name=client.name,
                title=(
                    "1 quotation item needs clarity"
                    if count == 1
                    else f"{count} quotation items need clarity"
                ),
                detail=None,
                at=None,
                path=f"/dashboard/clients/{client.id}/quotation",
                key=f"clarity:{client.id}:{count}",
            )
        )

    # Questions first, then approvals, expiring links, unclear rows;
    # within a kind the soonest/most recent leads.
    order = list(AttentionKind)
    items.sort(
        key=lambda i: (
            order.index(i.kind),
            -(
                i.at.timestamp()
                if i.at and i.kind != AttentionKind.link_expiring
                else 0
            ),
            i.at.timestamp()
            if i.at and i.kind == AttentionKind.link_expiring
            else 0,
        )
    )
    read = set(
        db.execute(
            select(AttentionRead.item_key).where(
                AttentionRead.user_id == user.id,
                AttentionRead.item_key.in_([i.key for i in items]),
            )
        ).scalars()
    )
    for item in items:
        # An open question cannot be dismissed, only resolved.
        item.read = (
            item.key in read and item.kind != AttentionKind.customer_question
        )
    return items


def mark_read(db: Session, user: User, keys: list[str]) -> None:
    """Remember that this user has read these items (idempotent)."""
    now = datetime.now(timezone.utc)
    db.execute(
        insert(AttentionRead)
        .values(
            [
                {"user_id": user.id, "item_key": key[:200], "read_at": now}
                for key in set(keys)
            ]
        )
        .on_conflict_do_nothing()
    )
    db.commit()
