"""
Floor plan → draft quote rows.

POST /clients/{client_id}/quotation/floor-plan/extract
    Image upload → rooms with dimensions, for the designer to confirm.

POST /clients/{client_id}/quotation/floor-plan/draft
    Confirmed rooms → draft rows. Nothing is saved: the client saves
    them through the draft-checkpoint flow, so the quotation only changes
    after the designer verifies and adds them.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from ..core import get_db
from ..models.business import Business
from ..models.user import User
from ..schemas.floorplan import (
    FloorPlanDraftRequest,
    FloorPlanDraftResponse,
    FloorPlanExtractResponse,
)
from ..services.client_access import get_client_or_404
from ..services.floorplan_draft import draft_items
from ..services.floorplan_extraction import (
    MAX_PLAN_BYTES,
    extract_floorplan,
    pending_rows,
    quoted_items,
    rate_book,
)
from ..services.image_quota import effective_max_bytes
from .deps import get_current_user

router = APIRouter()


@router.post(
    "/clients/{client_id}/quotation/floor-plan/extract",
    response_model=FloorPlanExtractResponse,
)
async def extract_floor_plan(
    client_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read rooms and dimensions off an uploaded floor-plan image."""
    client = get_client_or_404(client_id, db, current_user)
    business = (
        db.get(Business, client.business_id) if client.business_id else None
    )
    limit = effective_max_bytes(business, db)
    # Read one byte past the cap so an oversized upload is caught without
    # buffering all of it.
    image = await file.read(min(MAX_PLAN_BYTES, limit) + 1)
    return await extract_floorplan(
        db,
        current_user=current_user,
        client_id=str(client.id),
        business=business,
        image=image,
    )


@router.post(
    "/clients/{client_id}/quotation/floor-plan/draft",
    response_model=FloorPlanDraftResponse,
)
def draft_from_floor_plan(
    client_id: str,
    body: FloorPlanDraftRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Template rows for the confirmed rooms, priced from past rates."""
    get_client_or_404(client_id, db, current_user)
    items, warnings = draft_items(
        body.rooms,
        rate_book(db),
        quoted_items(db, client_id),
        pending_rows(db, client_id),
    )
    names = ", ".join(r.name for r in body.rooms)
    return FloorPlanDraftResponse(
        line_items=items,
        summary_text=f"Draft from floor plan: {names}",
        warnings=warnings,
    )
