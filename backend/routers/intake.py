"""
POST /clients/{client_id}/quotation/intake-check

For rows about to be added from any source: which quotation room each
belongs to, and whether a similar item is already there. Read-only.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core import get_db
from ..models.material import MaterialRate
from ..models.quotation import Quotation
from ..models.user import User
from ..schemas.intake import (
    IntakeCheckRequest,
    IntakeCheckResponse,
    IntakeRowOut,
    MaterialSuggestion,
    SimilarItem,
)
from ..services.checkpoint_ai_support import item_summary
from ..services.client_access import get_client_or_404
from ..services.intake import check_row, find_material
from .deps import get_current_user

router = APIRouter()


@router.post(
    "/clients/{client_id}/quotation/intake-check",
    response_model=IntakeCheckResponse,
)
def intake_check(
    client_id: str,
    body: IntakeCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Room match and likely duplicate for each incoming row."""
    get_client_or_404(client_id, db, current_user)
    quotation = (
        db.execute(
            select(Quotation).where(
                Quotation.client_id == uuid.UUID(client_id)
            )
        )
        .scalars()
        .first()
    )
    items = list(quotation.line_items) if quotation else []
    materials = list(db.execute(select(MaterialRate)).scalars().all())
    out: list[IntakeRowOut] = []
    for row in body.rows:
        check = check_row(row.room, row.description, items)
        similar = check.similar
        material = find_material(row.description, materials)
        out.append(
            IntakeRowOut(
                room=check.room,
                room_status=check.room_status,
                similar=(
                    SimilarItem(
                        id=str(similar.id),
                        room=similar.room,
                        description=similar.description,
                        summary=item_summary(similar),
                    )
                    if similar
                    else None
                ),
                material=(
                    MaterialSuggestion(
                        id=str(material.id),
                        name=material.name,
                        unit=material.unit,
                        unit_cost=float(material.unit_cost),
                    )
                    if material
                    else None
                ),
            )
        )
    return IntakeCheckResponse(rows=out)
