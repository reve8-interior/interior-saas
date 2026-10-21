"""Turn a design hotspot into a quotation line item."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.audit import AuditLog
from ..models.design import Design, DesignHotspot
from ..models.quotation import Quotation, QuotationStatus
from ..models.quotation_line_item import QuotationLineItem
from ..schemas.design import HotspotQuotationAdd
from .quotation_service import resolve_line_item


class HotspotQuotationError(Exception):
    """The hotspot cannot be added; `status_code` suits an HTTP response."""

    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


def _latest_quotation(db: Session, client_id: uuid.UUID) -> Quotation | None:
    return (
        db.execute(
            select(Quotation)
            .where(Quotation.client_id == client_id)
            .order_by(Quotation.created_at.desc())
        )
        .scalars()
        .first()
    )


def _ensure_quotation(
    db: Session, client_id: uuid.UUID, user_id: uuid.UUID
) -> Quotation:
    """The client's quotation, created (empty) on first use."""
    quotation = _latest_quotation(db, client_id)
    if quotation:
        return quotation

    selected = (
        db.execute(
            select(Design.id)
            .where(Design.client_id == client_id)
            .where(Design.is_selected.is_(True))
        )
        .scalars()
        .first()
    )
    quotation = Quotation(
        client_id=client_id,
        design_id=selected,
        status=QuotationStatus.pending,
    )
    db.add(quotation)
    db.add(
        AuditLog(
            user_id=user_id,
            action="quotation_created",
            entity_type="quotation",
            entity_id=str(client_id),
            payload={"source": "design_hotspot"},
            timestamp=datetime.utcnow(),
        )
    )
    db.flush()
    return quotation


def add_hotspot_to_quotation(
    db: Session,
    client_id: uuid.UUID,
    hotspot: DesignHotspot,
    body: HotspotQuotationAdd,
    user_id: uuid.UUID,
) -> QuotationLineItem:
    """Create the line item, link it back to the hotspot and audit it."""
    if hotspot.quotation_line_item_id:
        raise HotspotQuotationError(
            "This hotspot is already in the quotation", 409
        )

    material = hotspot.material
    unit = body.unit or (material.unit if material else None)
    if not unit:
        raise HotspotQuotationError(
            "Choose a unit; this hotspot has no material to take it from", 422
        )

    quotation = _ensure_quotation(db, client_id, user_id)
    if quotation.status == QuotationStatus.approved:
        raise HotspotQuotationError(
            "The quotation is already approved and can no longer change", 409
        )

    rate = body.rate
    if rate is None and material is not None:
        rate = float(material.unit_cost)

    item = QuotationLineItem(
        quotation_id=quotation.id,
        room=body.room.strip(),
        # Append after the existing lines.
        position=max((i.position for i in quotation.line_items), default=-1)
        + 1,
        description=body.description or hotspot.label,
        catalog_type=body.catalog_type,
        unit=unit,
        raw_dimension=body.raw_dimension,
        qty=body.qty,
        rate=rate,
        remarks=body.remarks if body.remarks is not None else hotspot.notes,
        extra={},
        material_id=hotspot.material_id,
    )
    resolve_line_item(item)
    db.add(item)
    db.flush()

    hotspot.quotation_line_item_id = item.id
    db.add(
        AuditLog(
            user_id=user_id,
            action="quotation_item_created",
            entity_type="quotation_line_item",
            entity_id=str(quotation.id),
            payload={
                "room": item.room,
                "description": item.description,
                "source": "design_hotspot",
                "hotspot_id": str(hotspot.id),
            },
            timestamp=datetime.utcnow(),
        )
    )
    return item
