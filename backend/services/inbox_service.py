"""
Inbox: every message customers sent from shared quotation links, across all
clients the caller may see. Open questions lead; the rest is newest first.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.client import Client
from ..models.quotation import Quotation
from ..models.quotation_message import QuotationMessage
from ..models.user import User
from ..schemas.dashboard import InboxMessage
from .client_access import restrict_to_accessible

# The inbox is a working list, not an archive.
INBOX_LIMIT = 200


def list_inbox(db: Session, user: User) -> list[InboxMessage]:
    """Customer messages for clients the caller may see."""
    q = (
        select(QuotationMessage, Client, User.full_name)
        .join(Quotation, QuotationMessage.quotation_id == Quotation.id)
        .join(Client, Quotation.client_id == Client.id)
        .outerjoin(User, User.id == QuotationMessage.resolved_by_id)
        .where(Client.is_active.is_(True))
        .order_by(QuotationMessage.created_at.desc())
        .limit(INBOX_LIMIT)
    )
    messages = [
        InboxMessage(
            id=m.id,
            version_id=m.version_id,
            version_number=m.version_number,
            kind=m.kind,
            name=m.name,
            message=m.message,
            created_at=m.created_at,
            resolved_at=m.resolved_at,
            resolved_by_name=resolver,
            client_id=client.id,
            client_name=client.name,
            client_contact=client.contact_info or {},
        )
        for m, client, resolver in db.execute(restrict_to_accessible(q, user))
    ]
    # Stable sort keeps newest-first inside each group.
    messages.sort(
        key=lambda m: not (m.kind == "question" and m.resolved_at is None)
    )
    return messages
