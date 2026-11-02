"""Applying meeting notes to a quotation: add, undo (newest first), revert."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.audit import AuditLog
from ..models.checkpoint import Checkpoint
from ..models.quotation import Quotation
from ..models.user import User
from ..schemas.checkpoint_ai import (
    RemoveCheckpointResponse,
    RevertResponse,
    UpdateQuotationItemsRequest,
    UpdateQuotationItemsResponse,
)
from .checkpoint_ai_support import (
    restore_snapshot_items,
    snapshot_line_items,
)
from .checkpoint_merge import merge_checkpoint_items
from .column_settings import get_line_item_columns, missing_required_problems


def add_checkpoint_to_quotation(
    db: Session,
    client_id: str,
    body: UpdateQuotationItemsRequest,
    user: User,
) -> UpdateQuotationItemsResponse:
    """Add a meeting's verified rows to the client's quotation.

    Meetings can be added in any order; each row edits the item it was
    anchored on. The time, the person and the numbers are recorded in the
    audit log, and the quotation is snapshotted first so this can be undone.
    """
    # Removals name an existing item rather than describing one, so the
    # mandatory-column rules do not apply to them.
    problems = missing_required_problems(
        [li for li in body.line_items if li.action != "remove"],
        get_line_item_columns(db),
    )
    if problems:
        raise HTTPException(
            status_code=422,
            detail="Items missing mandatory columns — " + "; ".join(problems),
        )

    checkpoint: Checkpoint | None = (
        db.execute(
            select(Checkpoint).where(
                Checkpoint.id == uuid.UUID(body.checkpoint_id)
            )
        )
        .scalars()
        .first()
    )
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    existing_quotation: Quotation | None = (
        db.execute(
            select(Quotation).where(
                Quotation.client_id == uuid.UUID(client_id)
            )
        )
        .scalars()
        .first()
    )

    cp_uuid = uuid.UUID(body.checkpoint_id)

    if existing_quotation:
        snapshot_line_items(existing_quotation, body.checkpoint_id)
        merge = merge_checkpoint_items(
            existing_quotation, cp_uuid, list(body.line_items), db
        )
        existing_quotation.checkpoint_id = cp_uuid  # type: ignore[assignment]
        action = "updated"
        quotation_id = str(existing_quotation.id)
    else:
        quotation = Quotation(
            client_id=uuid.UUID(client_id),
            checkpoint_id=cp_uuid,
            snapshots=[],
        )
        db.add(quotation)
        db.flush()
        # Snapshot the empty starting state so the first checkpoint has
        # a history entry too (visible in What Changed, removable LIFO).
        snapshot_line_items(quotation, body.checkpoint_id)
        merge = merge_checkpoint_items(
            quotation, cp_uuid, list(body.line_items), db
        )
        action = "created"
        quotation_id = str(quotation.id)

    checkpoint.added_to_quotation = True  # type: ignore[assignment]
    checkpoint.applied_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    checkpoint.applied_by_id = user.id  # type: ignore[assignment]
    db.add(
        AuditLog(
            user_id=user.id,
            action="meeting_added_to_quotation",
            entity_type="checkpoint",
            entity_id=str(cp_uuid),
            payload={
                "client_id": client_id,
                "quotation_id": quotation_id,
                "added": merge.added,
                "updated": merge.updated,
                "removed": merge.marked_removed,
                "skipped": merge.skipped,
                "item_ids": merge.updated_item_ids,
            },
            timestamp=datetime.now(timezone.utc),
        )
    )

    db.commit()

    return UpdateQuotationItemsResponse(
        quotation_id=quotation_id,
        action=action,
        items_count=len(body.line_items),
        items_added=merge.added,
        items_updated=merge.updated,
        items_removed=merge.marked_removed,
        items_skipped=merge.skipped,
    )


def remove_checkpoint(
    db: Session, client_id: str, checkpoint_id: str, user: User
) -> RemoveCheckpointResponse:
    """Take a meeting's rows back out of the quotation.

    Restores the snapshot taken just before it was added, so it can only
    be undone while nothing was added after it. Meetings are ordered by
    when they were added, not by when the notes were written.
    """
    checkpoint: Checkpoint | None = (
        db.execute(
            select(Checkpoint).where(Checkpoint.id == uuid.UUID(checkpoint_id))
        )
        .scalars()
        .first()
    )
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    if not checkpoint.added_to_quotation:
        raise HTTPException(
            status_code=409,
            detail="This checkpoint is not on the quotation.",
        )

    applied_at = checkpoint.applied_at or checkpoint.created_at
    later: Checkpoint | None = (
        db.execute(
            select(Checkpoint)
            .where(
                Checkpoint.client_id == uuid.UUID(client_id),
                Checkpoint.added_to_quotation.is_(True),
                Checkpoint.id != checkpoint.id,
                func.coalesce(Checkpoint.applied_at, Checkpoint.created_at)
                > applied_at,
            )
            .order_by(
                func.coalesce(Checkpoint.applied_at, Checkpoint.created_at)
            )
        )
        .scalars()
        .first()
    )
    if later is not None:
        when = later.applied_at or later.created_at
        raise HTTPException(
            status_code=409,
            detail=(
                "Undo the meeting added after this one first: the notes "
                f"from {when:%d %b %Y, %H:%M} went in later."
            ),
        )

    quotation: Quotation | None = (
        db.execute(
            select(Quotation).where(
                Quotation.client_id == uuid.UUID(client_id)
            )
        )
        .scalars()
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="No quotation found")

    snapshots: list[dict] = list(quotation.snapshots or [])
    indices = [
        i
        for i, s in enumerate(snapshots)
        if s.get("checkpoint_id") == checkpoint_id
    ]
    if indices:
        # Restore the state captured just before this checkpoint applied
        idx = indices[-1]
        items_restored = restore_snapshot_items(quotation, snapshots[idx], db)
        quotation.snapshots = snapshots[:idx] + snapshots[idx + 1 :]
    else:
        # Legacy (no snapshot recorded): drop only this checkpoint's items
        for li in list(quotation.line_items):
            if li.source_checkpoint_id == checkpoint.id:
                db.delete(li)
        db.flush()
        items_restored = 0

    checkpoint.added_to_quotation = False  # type: ignore[assignment]
    checkpoint.applied_at = None  # type: ignore[assignment]
    checkpoint.applied_by_id = None  # type: ignore[assignment]
    # Sessions run with autoflush off; without this the query below would
    # still see this checkpoint as applied.
    db.flush()

    # Re-point the quotation at the meeting most recently added
    last_added: Checkpoint | None = (
        db.execute(
            select(Checkpoint)
            .where(
                Checkpoint.client_id == uuid.UUID(client_id),
                Checkpoint.added_to_quotation.is_(True),
            )
            .order_by(
                func.coalesce(
                    Checkpoint.applied_at, Checkpoint.created_at
                ).desc(),
                Checkpoint.id.desc(),
            )
        )
        .scalars()
        .first()
    )
    quotation.checkpoint_id = last_added.id if last_added else None  # type: ignore[assignment]
    db.add(
        AuditLog(
            user_id=user.id,
            action="meeting_removed_from_quotation",
            entity_type="checkpoint",
            entity_id=str(checkpoint.id),
            payload={"client_id": client_id, "restored": items_restored},
            timestamp=datetime.now(timezone.utc),
        )
    )

    db.commit()

    return RemoveCheckpointResponse(
        quotation_id=str(quotation.id),
        checkpoint_id=checkpoint_id,
        items_restored=items_restored,
    )


def revert_to_checkpoint(
    db: Session, quotation_id: str, checkpoint_id: str
) -> RevertResponse:
    """Step 1 — run the PydanticAI agent on uploaded text/audio or pasted text.

    Returns extracted meeting minutes, line items, and material rate hints.
    Every call is recorded in agent_audit_log.
    """
    quotation: Quotation | None = (
        db.execute(
            select(Quotation).where(Quotation.id == uuid.UUID(quotation_id))
        )
        .scalars()
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")

    snapshots: list[dict] = list(quotation.snapshots or [])
    target = next(
        (s for s in snapshots if s.get("checkpoint_id") == checkpoint_id),
        None,
    )
    if not target:
        raise HTTPException(
            status_code=404,
            detail=f"No snapshot found for checkpoint {checkpoint_id}",
        )

    # Clear added_to_quotation on the checkpoint whose items we're replacing
    prev_checkpoint_id = quotation.checkpoint_id
    if prev_checkpoint_id and str(prev_checkpoint_id) != checkpoint_id:
        prev_cp: Checkpoint | None = (
            db.execute(
                select(Checkpoint).where(Checkpoint.id == prev_checkpoint_id)
            )
            .scalars()
            .first()
        )
        if prev_cp:
            prev_cp.added_to_quotation = False  # type: ignore[assignment]

    items_restored = restore_snapshot_items(quotation, target, db)

    # Remove this snapshot from history (revert = undo that state)
    quotation.snapshots = [
        s for s in snapshots if s.get("checkpoint_id") != checkpoint_id
    ]
    quotation.checkpoint_id = uuid.UUID(checkpoint_id)  # type: ignore[assignment]

    # Mark the reverted-to checkpoint as no longer added
    reverted_cp: Checkpoint | None = (
        db.execute(
            select(Checkpoint).where(Checkpoint.id == uuid.UUID(checkpoint_id))
        )
        .scalars()
        .first()
    )
    if reverted_cp:
        reverted_cp.added_to_quotation = False  # type: ignore[assignment]

    db.commit()
    db.refresh(quotation)

    return RevertResponse(
        quotation_id=str(quotation.id),
        reverted_to_checkpoint_id=checkpoint_id,
        items_restored=items_restored,
    )
