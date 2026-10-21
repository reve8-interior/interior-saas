import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core import get_db
from ..models.audit import AuditLog
from ..models.checkpoint import Checkpoint, CheckpointStatus
from ..models.client import ProjectPhase
from ..models.final_summary import FinalSummary
from ..models.user import User
from ..schemas.checkpoint import (
    CheckpointCreate,
    CheckpointRead,
    CheckpointStatusUpdate,
    FinalSummaryCreate,
    FinalSummaryRead,
)
from ..services.client_access import get_client_or_404
from .deps import get_current_user

router = APIRouter()


@router.get(
    "/clients/{client_id}/checkpoints", response_model=list[CheckpointRead]
)
def list_checkpoints(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)
    # id tiebreak keeps ordering deterministic for checkpoints created
    # within the same microsecond.
    return (
        db.execute(
            select(Checkpoint)
            .where(Checkpoint.client_id == uuid.UUID(client_id))
            .order_by(Checkpoint.created_at.asc(), Checkpoint.id.asc())
        )
        .scalars()
        .all()
    )


@router.post(
    "/clients/{client_id}/checkpoints",
    response_model=CheckpointRead,
    status_code=201,
)
def create_checkpoint(
    client_id: str,
    body: CheckpointCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)
    checkpoint = Checkpoint(
        client_id=uuid.UUID(client_id),
        summary_text=body.summary_text,
        structured_diff=body.structured_diff,
        raw_conversation=body.raw_conversation,
        source=body.source,
        status=body.status,
    )
    db.add(checkpoint)
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="checkpoint_created",
            entity_type="checkpoint",
            entity_id=None,
            payload={"client_id": client_id, "source": body.source},
            timestamp=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(checkpoint)
    return checkpoint


@router.patch(
    "/checkpoints/{checkpoint_id}/extracted-items",
    response_model=CheckpointRead,
)
def save_extracted_items(
    checkpoint_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persist AI-extracted line items into structured_diff.

    Also carries the `extraction` provenance block when the caller
    supplies one (a re-run from the checkpoint card). An empty item list
    with a provenance stamp means "extraction ran and found no billable
    work"; without one it means "never extracted" — the UI must be able
    to tell those apart, or it offers to re-extract forever.
    """
    checkpoint = (
        db.execute(
            select(Checkpoint).where(Checkpoint.id == uuid.UUID(checkpoint_id))
        )
        .scalars()
        .first()
    )
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    diff = dict(checkpoint.structured_diff or {})
    diff["line_items"] = body.get("line_items", [])
    extraction = body.get("extraction")
    if isinstance(extraction, dict):
        diff["extraction"] = extraction
    checkpoint.structured_diff = diff
    db.commit()
    db.refresh(checkpoint)
    return checkpoint


@router.put(
    "/checkpoints/{checkpoint_id}/status", response_model=CheckpointRead
)
def update_checkpoint_status(
    checkpoint_id: str,
    body: CheckpointStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.status not in [s.value for s in CheckpointStatus]:
        raise HTTPException(
            status_code=400, detail=f"Invalid status: {body.status}"
        )
    checkpoint = (
        db.execute(
            select(Checkpoint).where(Checkpoint.id == uuid.UUID(checkpoint_id))
        )
        .scalars()
        .first()
    )
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    checkpoint.status = body.status
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="checkpoint_status_updated",
            entity_type="checkpoint",
            entity_id=checkpoint_id,
            payload={"status": body.status},
            timestamp=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(checkpoint)
    return checkpoint


@router.post(
    "/clients/{client_id}/final-summary",
    response_model=FinalSummaryRead,
    status_code=201,
)
def confirm_final_summary(
    client_id: str,
    body: FinalSummaryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = get_client_or_404(client_id, db, current_user)

    existing = (
        db.execute(
            select(FinalSummary).where(
                FinalSummary.client_id == uuid.UUID(client_id)
            )
        )
        .scalars()
        .first()
    )

    now = datetime.now(timezone.utc)
    if existing:
        existing.summary_text = body.summary_text
        existing.confirmed_by = body.confirmed_by
        existing.confirmed_at = now if body.confirmed_by else None
        existing.confirmed_by_user_id = (
            current_user.id if body.confirmed_by else None
        )
        if body.checkpoint_id_ref:
            existing.checkpoint_id_ref = uuid.UUID(body.checkpoint_id_ref)
        fs = existing
    else:
        fs = FinalSummary(
            client_id=uuid.UUID(client_id),
            summary_text=body.summary_text,
            checkpoint_id_ref=uuid.UUID(body.checkpoint_id_ref)
            if body.checkpoint_id_ref
            else None,
            confirmed_by=body.confirmed_by,
            confirmed_at=now if body.confirmed_by else None,
            confirmed_by_user_id=current_user.id
            if body.confirmed_by
            else None,
        )
        db.add(fs)

    # Auto-advance phase to design on confirmation
    if body.confirmed_by and client.current_phase == ProjectPhase.discussion:
        client.current_phase = ProjectPhase.design

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="final_summary_confirmed",
            entity_type="final_summary",
            entity_id=client_id,
            payload={"confirmed_by": body.confirmed_by},
            timestamp=now,
        )
    )
    db.commit()
    db.refresh(fs)
    return fs


@router.get(
    "/clients/{client_id}/final-summary", response_model=FinalSummaryRead
)
def get_final_summary(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)
    fs = (
        db.execute(
            select(FinalSummary).where(
                FinalSummary.client_id == uuid.UUID(client_id)
            )
        )
        .scalars()
        .first()
    )
    if not fs:
        raise HTTPException(status_code=404, detail="No final summary found")
    return fs
