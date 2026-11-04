import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core import get_db
from ..models.audit import AuditLog
from ..models.client import Client, ProjectPhase
from ..models.design import Design, DesignHotspot
from ..models.quotation import Quotation, QuotationStatus
from ..models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from ..models.user import User
from ..schemas.quotation import (
    QuotationDerivedState,
    QuotationDiffResponse,
    QuotationLineItemCreate,
    QuotationLineItemRead,
    QuotationLineItemUpdate,
    QuotationRead,
)
from ..schemas.quotation_review import QuotationReview
from ..services.client_access import get_client_or_404, restrict_to_accessible
from ..services.intake_gate import (
    IntakeRejected,
    decide,
    refuse_duplicate,
    tidy,
)
from ..services.room_matching import match_name
from ..services.quotation_concurrency import (
    ensure_editable,
    ensure_not_stale,
    last_editor_names,
    lock_quotation,
)
from ..services.quotation_diff import (
    attach_item_ids,
    compute_quotation_diff,
)
from ..services.quotation_review import review_quotation
from ..services.quotation_service import (
    build_quotation_view,
    derive_state,
    resolve_line_item,
)
from ..services.quotation_version import create_version
from .deps import get_current_user

router = APIRouter()

# Fields whose change invalidates previously derived pricing/sqft.
_DERIVED_INPUTS = {"raw_dimension", "rate", "qty", "unit"}


def _latest_quotation(client_id: str, db: Session) -> Quotation | None:
    return (
        db.execute(
            select(Quotation)
            .where(Quotation.client_id == uuid.UUID(client_id))
            .order_by(Quotation.created_at.desc())
        )
        .scalars()
        .first()
    )


def _quotation_or_404(
    quotation_id: str, db: Session, current_user: User
) -> Quotation:
    q = (
        select(Quotation)
        .join(Client, Quotation.client_id == Client.id)
        .where(Quotation.id == uuid.UUID(quotation_id))
    )
    q = restrict_to_accessible(q, current_user)
    quotation = db.execute(q).scalars().first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return quotation


def _item_or_404(
    quotation: Quotation, item_id: str, db: Session
) -> QuotationLineItem:
    item = (
        db.execute(
            select(QuotationLineItem)
            .where(QuotationLineItem.id == uuid.UUID(item_id))
            .where(QuotationLineItem.quotation_id == quotation.id)
        )
        .scalars()
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Line item not found")
    return item


@router.post(
    "/clients/{client_id}/quotation",
    response_model=QuotationRead,
    status_code=201,
)
def create_quotation(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create the client's quotation; line items are added afterwards."""
    get_client_or_404(client_id, db, current_user)
    if _latest_quotation(client_id, db):
        raise HTTPException(
            status_code=409, detail="Client already has a quotation"
        )

    selected_design = (
        db.execute(
            select(Design)
            .where(Design.client_id == uuid.UUID(client_id))
            .where(Design.is_selected.is_(True))
        )
        .scalars()
        .first()
    )
    quotation = Quotation(
        client_id=uuid.UUID(client_id),
        design_id=selected_design.id if selected_design else None,
        status=QuotationStatus.pending,
    )
    db.add(quotation)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="quotation_created",
            entity_type="quotation",
            entity_id=client_id,
            payload={},
            timestamp=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(quotation)
    return build_quotation_view(quotation)


def _attach_design_sources(view: QuotationRead, db: Session) -> None:
    """Mark lines with their last editor and, if from a hotspot, its design."""
    items = [i for room in view.rooms for i in room.items]
    if not items:
        return
    editors = last_editor_names(db, [i.id for i in items])
    for item in items:
        item.edited_by = editors.get(item.id)
    rows = db.execute(
        select(
            DesignHotspot.quotation_line_item_id,
            Design.id,
            Design.title,
            DesignHotspot.id,
        )
        .join(Design, Design.id == DesignHotspot.design_id)
        .where(DesignHotspot.quotation_line_item_id.in_([i.id for i in items]))
    ).all()
    by_item = {
        line_id: (design_id, title, hotspot_id)
        for line_id, design_id, title, hotspot_id in rows
    }
    for item in items:
        if item.id in by_item:
            (
                item.source_design_id,
                item.source_design_title,
                item.source_hotspot_id,
            ) = by_item[item.id]


@router.get("/clients/{client_id}/quotation", response_model=QuotationRead)
def get_quotation(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)
    quotation = _latest_quotation(client_id, db)
    if not quotation:
        raise HTTPException(status_code=404, detail="No quotation found")
    view = build_quotation_view(quotation)
    _attach_design_sources(view, db)
    return view


@router.get(
    "/clients/{client_id}/quotation/review", response_model=QuotationReview
)
def review_client_quotation(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pre-send checks: missing prices, duplicates, outliers, gaps."""
    get_client_or_404(client_id, db, current_user)
    quotation = _latest_quotation(client_id, db)
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return review_quotation(list(quotation.line_items))


@router.get(
    "/clients/{client_id}/quotation/diff",
    response_model=QuotationDiffResponse,
)
def get_quotation_diff(
    client_id: str,
    checkpoint_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Added / removed / changed items, in one of two modes.

    - No `checkpoint_id` (default "Current"): current line items vs the
      latest snapshot — what changed since the last checkpoint was
      applied. With no snapshots yet, everything is reported as added.
    - With `checkpoint_id`: what THAT checkpoint changed — its snapshot
      (state before it was applied) vs the state after it (the next
      snapshot, or the current items if it was the last one applied).

    Every entry carries `item_id` pointing at the live quotation row it
    resolves to (None when the item no longer exists).
    """
    get_client_or_404(client_id, db, current_user)
    quotation = _latest_quotation(client_id, db)
    if not quotation:
        raise HTTPException(status_code=404, detail="No quotation found")

    snapshots: list[dict] = [
        s
        for s in (quotation.snapshots or [])
        if not str(s.get("checkpoint_id", "")).startswith("pre-revert-")
    ]

    baseline: dict | None = None
    target_items: list = quotation.line_items
    if checkpoint_id is not None:
        # Last application of this checkpoint (re-adding appends a
        # newer snapshot with the same checkpoint_id).
        indices = [
            i
            for i, s in enumerate(snapshots)
            if s.get("checkpoint_id") == checkpoint_id
        ]
        if not indices:
            raise HTTPException(
                status_code=404,
                detail=f"No snapshot found for checkpoint {checkpoint_id}",
            )
        idx = indices[-1]
        baseline = snapshots[idx]
        if idx + 1 < len(snapshots):
            target_items = list(snapshots[idx + 1].get("line_items", []))
    elif snapshots:
        baseline = snapshots[-1]

    added, removed, changed, unchanged = compute_quotation_diff(
        target_items,
        list(baseline.get("line_items", [])) if baseline else [],
    )
    attach_item_ids(added, quotation.line_items)
    attach_item_ids(removed, quotation.line_items)
    attach_item_ids(changed, quotation.line_items)
    return QuotationDiffResponse(
        quotation_id=quotation.id,  # type: ignore[arg-type]
        baseline_checkpoint_id=(
            baseline.get("checkpoint_id") if baseline else None
        ),
        baseline_created_at=baseline.get("created_at") if baseline else None,
        added=added,
        removed=removed,
        changed=changed,
        unchanged_count=unchanged,
    )


@router.post(
    "/clients/{client_id}/quotation/approve", response_model=QuotationRead
)
def approve_quotation(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = get_client_or_404(client_id, db, current_user)
    quotation = _latest_quotation(client_id, db)
    if not quotation:
        raise HTTPException(status_code=404, detail="No quotation found")

    state = derive_state(quotation.line_items)
    if state == QuotationDerivedState.clarification_needed:
        pending = sum(
            1
            for i in quotation.line_items
            if i.status == QuotationItemStatus.pending_clarity
        )
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot approve: {pending} line item(s) still pending "
                "clarification"
            ),
        )
    if not quotation.line_items:
        raise HTTPException(
            status_code=400, detail="Cannot approve an empty quotation"
        )

    quotation.status = QuotationStatus.approved
    # Freeze what the client agreed to as a shareable version.
    create_version(db, quotation, current_user.id, label="Approved quotation")
    if client.current_phase == ProjectPhase.quotation:
        client.current_phase = ProjectPhase.implementation

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="quotation_approved",
            entity_type="quotation",
            entity_id=str(quotation.id),
            payload={"client_id": client_id},
            timestamp=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(quotation)
    return build_quotation_view(quotation)


@router.post(
    "/quotations/{quotation_id}/items",
    response_model=QuotationLineItemRead,
    status_code=201,
)
def create_line_item(
    quotation_id: str,
    body: QuotationLineItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quotation = _quotation_or_404(quotation_id, db, current_user)

    lock_quotation(db, quotation)
    ensure_editable(quotation)
    try:
        decision = decide(body.room, body.description, quotation.line_items)
        refuse_duplicate(decision, body.allow_duplicate)
    except IntakeRejected as rejected:
        raise HTTPException(
            status_code=rejected.status_code, detail=str(rejected)
        ) from rejected
    item = QuotationLineItem(
        quotation_id=quotation.id,
        **{
            **body.model_dump(exclude={"allow_duplicate"}),
            "room": decision.room,
            "description": decision.description,
        },
    )
    resolve_line_item(item)

    db.add(item)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="quotation_item_created",
            entity_type="quotation_line_item",
            entity_id=str(quotation.id),
            payload={
                "room": item.room,
                "description": item.description,
                "status": item.status.value
                if isinstance(item.status, QuotationItemStatus)
                else item.status,
            },
            timestamp=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(item)
    return item


def _gate_renamed_line(
    quotation: Quotation,
    item: QuotationLineItem,
    changes: dict,
    allow_duplicate: bool,
) -> None:
    """Editing a line's room or wording, or bringing a removed line back,
    meets the same gate as adding one.

    Only a real change is checked, so an unrelated edit to a line that
    already resembles another is never blocked. `changes` is updated in
    place with the tidy text and the quotation's own room spelling.
    """
    revived = (
        item.status == QuotationItemStatus.removed
        and changes.get("status", QuotationItemStatus.removed)
        != QuotationItemStatus.removed
    )
    if "room" not in changes and "description" not in changes and not revived:
        return
    room = changes.get("room", item.room)
    description = changes.get("description", item.description)
    # The line's own room counts as one of the quotation's rooms, so
    # re-typing it in other letters keeps the quotation's spelling.
    live_rooms = list(
        dict.fromkeys(
            i.room
            for i in quotation.line_items
            if i.status != QuotationItemStatus.removed
        )
    )
    snapped, status = match_name(tidy(room), live_rooms)
    if status == "existing":
        room = snapped
    try:
        decision = decide(
            room,
            description,
            [i for i in quotation.line_items if i is not item],
        )
        moved = (
            revived
            or decision.room != item.room
            or tidy(description) != tidy(item.description)
        )
        if moved:
            refuse_duplicate(decision, allow_duplicate)
    except IntakeRejected as rejected:
        raise HTTPException(
            status_code=rejected.status_code, detail=str(rejected)
        ) from rejected
    if "room" in changes:
        changes["room"] = decision.room
    if "description" in changes:
        changes["description"] = decision.description


@router.post(
    "/clients/{client_id}/quotation/reopen",
    response_model=QuotationRead,
)
def reopen_quotation(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Let an approved quotation change again. Audited; the approved
    version stays as it was frozen."""
    get_client_or_404(client_id, db, current_user)
    quotation = _latest_quotation(client_id, db)
    if not quotation:
        raise HTTPException(status_code=404, detail="No quotation found")
    lock_quotation(db, quotation)
    if quotation.status != QuotationStatus.approved:
        raise HTTPException(
            status_code=409, detail="This quotation is not approved"
        )
    quotation.status = QuotationStatus.pending
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="quotation_reopened",
            entity_type="quotation",
            entity_id=str(quotation.id),
            payload={"client_id": client_id},
            timestamp=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(quotation)
    return build_quotation_view(quotation)


@router.patch(
    "/quotations/{quotation_id}/items/{item_id}",
    response_model=QuotationLineItemRead,
)
def update_line_item(
    quotation_id: str,
    item_id: str,
    body: QuotationLineItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quotation = _quotation_or_404(quotation_id, db, current_user)
    item = _item_or_404(quotation, item_id, db)

    lock_quotation(db, quotation)
    ensure_editable(quotation)
    db.refresh(item)
    ensure_not_stale(db, item, body.expected_updated_at)

    changes = body.model_dump(
        exclude_unset=True, exclude={"expected_updated_at", "allow_duplicate"}
    )
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    _gate_renamed_line(quotation, item, changes, body.allow_duplicate)

    for field, value in changes.items():
        setattr(item, field, value)

    # A changed pricing input invalidates the derived price and any
    # dimension-driven clarity flag, unless the caller set them explicitly.
    if _DERIVED_INPUTS & changes.keys():
        if "initial_price" not in changes:
            item.initial_price = None
        if (
            "status" not in changes
            and item.status == QuotationItemStatus.pending_clarity
        ):
            item.status = QuotationItemStatus.draft
        resolve_line_item(item)

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="quotation_item_updated",
            entity_type="quotation_line_item",
            entity_id=str(item.id),
            payload={"fields": sorted(changes.keys())},
            timestamp=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(item)
    return item


@router.delete(
    "/quotations/{quotation_id}/items/{item_id}",
    status_code=204,
)
def delete_line_item(
    quotation_id: str,
    item_id: str,
    expected_updated_at: datetime | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quotation = _quotation_or_404(quotation_id, db, current_user)
    item = _item_or_404(quotation, item_id, db)
    lock_quotation(db, quotation)
    ensure_editable(quotation)
    db.refresh(item)
    ensure_not_stale(db, item, expected_updated_at)

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="quotation_item_deleted",
            entity_type="quotation_line_item",
            entity_id=str(item.id),
            payload={"description": item.description, "room": item.room},
            timestamp=datetime.utcnow(),
        )
    )
    db.delete(item)
    db.commit()
