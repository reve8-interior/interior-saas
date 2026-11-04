"""
Guards for several people editing one quotation.

- Stale edits: a client sends the `updated_at` it last saw; if the row has
  changed since, the edit is refused with a message naming who changed it.
- Locking: anything that rewrites the quotation (adding or undoing a
  meeting, editing a row) takes a row lock on the quotation first, so those
  operations run one after another rather than interleaving.
- Undo guard: undoing a meeting restores a whole snapshot, which would
  silently discard rows edited by hand since. It is refused unless forced.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Sequence

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.audit import AuditLog
from ..models.quotation import Quotation, QuotationStatus
from ..models.quotation_line_item import QuotationLineItem
from ..models.user import User

# Adding a meeting touches its rows within moments of `applied_at`; edits
# further out than this are someone working on the rows by hand.
APPLY_SLACK = timedelta(seconds=10)


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def lock_quotation(db: Session, quotation: Quotation) -> None:
    """Hold the quotation's row lock until the transaction ends.

    Also reloads its columns, so a waiting caller sees what the one it
    waited for wrote.
    """
    db.refresh(quotation, with_for_update=True)


APPROVED_MESSAGE = (
    "This quotation is approved, so it can no longer change. "
    "Reopen it to make changes."
)


def ensure_editable(quotation: Quotation) -> None:
    """Refuse any change to an approved quotation (409). Call after the lock."""
    if quotation.status == QuotationStatus.approved:
        raise HTTPException(status_code=409, detail=APPROVED_MESSAGE)


def last_editor_name(db: Session, item_id: uuid.UUID) -> str | None:
    """Who last changed a line item, from the audit trail."""
    row = db.execute(
        select(User.full_name, User.email)
        .join(AuditLog, AuditLog.user_id == User.id)
        .where(
            AuditLog.entity_type == "quotation_line_item",
            AuditLog.entity_id == str(item_id),
        )
        .order_by(AuditLog.timestamp.desc())
        .limit(1)
    ).first()
    if row is None:
        return None
    return row[0] or row[1]


def last_editor_names(
    db: Session, item_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, str]:
    """Who last changed each line item, from the audit trail, in one query."""
    if not item_ids:
        return {}
    rows = db.execute(
        select(AuditLog.entity_id, User.full_name, User.email)
        .join(User, AuditLog.user_id == User.id)
        .where(
            AuditLog.entity_type == "quotation_line_item",
            AuditLog.entity_id.in_([str(i) for i in item_ids]),
        )
        .order_by(AuditLog.entity_id, AuditLog.timestamp.desc())
        .distinct(AuditLog.entity_id)
    ).all()
    return {uuid.UUID(entity): name or email for entity, name, email in rows}


def ensure_not_stale(
    db: Session,
    item: QuotationLineItem,
    expected_updated_at: datetime | None,
) -> None:
    """Refuse an edit made against an out-of-date copy of the row."""
    if expected_updated_at is None:
        return
    if _utc(item.updated_at) == _utc(expected_updated_at):
        return
    who = last_editor_name(db, item.id)
    raise HTTPException(
        status_code=409,
        detail=(
            f"{who or 'Someone'} changed this row while you were editing. "
            "The latest version has been loaded; please try again."
        ),
    )


def hand_edited_since(
    items: Sequence[QuotationLineItem], applied_at: datetime
) -> list[QuotationLineItem]:
    """Rows edited after a meeting went in (beyond the apply itself)."""
    cutoff = _utc(applied_at) + APPLY_SLACK
    return [i for i in items if _utc(i.updated_at) > cutoff]


def refuse_if_hand_edited(
    items: Sequence[QuotationLineItem], applied_at: datetime, force: bool
) -> None:
    """Block an undo that would discard hand edits, unless forced."""
    if force:
        return
    edited = hand_edited_since(items, applied_at)
    if not edited:
        return
    raise HTTPException(
        status_code=409,
        detail=(
            f"{len(edited)} row(s) were edited by hand after this meeting "
            "was added; undoing it would discard those edits "
            f"(e.g. {edited[0].room} — {edited[0].description}). "
            "Confirm to undo anyway."
        ),
    )
