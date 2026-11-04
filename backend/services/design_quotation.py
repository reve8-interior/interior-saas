"""Turn a design hotspot into a quotation line item."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.audit import AuditLog
from ..models.design import Design, DesignHotspot
from ..models.quotation import Quotation, QuotationStatus
from ..models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from ..schemas.design import HotspotQuotationAdd
from .intake_gate import IntakeRejected, decide, refuse_duplicate
from .quotation_concurrency import APPROVED_MESSAGE, lock_quotation
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


# Changing any of these invalidates the derived price (mirrors the line-item
# PATCH route and the meeting merge).
_PRICING_INPUTS = ("unit", "raw_dimension", "qty", "rate")


def _update_existing_item(
    db: Session,
    client_id: uuid.UUID,
    hotspot: DesignHotspot,
    body: HotspotQuotationAdd,
    user_id: uuid.UUID,
) -> QuotationLineItem:
    """Fold the hotspot into an existing line instead of adding a duplicate."""
    quotation = _latest_quotation(db, client_id)
    if quotation is None:
        raise HotspotQuotationError("This client has no quotation yet", 404)
    if quotation.status == QuotationStatus.approved:
        raise HotspotQuotationError(APPROVED_MESSAGE, 409)
    lock_quotation(db, quotation)
    item = next(
        (
            i
            for i in quotation.line_items
            if i.id == body.update_item_id
            and i.status != QuotationItemStatus.removed
        ),
        None,
    )
    if item is None:
        raise HotspotQuotationError(
            "That line is no longer in the quotation", 404
        )

    incoming = {
        "unit": body.unit,
        "raw_dimension": body.raw_dimension,
        "qty": body.qty,
        "rate": body.rate,
    }
    changed = []
    for field, value in incoming.items():
        if value is None:
            continue
        current = getattr(item, field)
        same = (
            float(current) == float(value)
            if isinstance(value, (int, float)) and current is not None
            else current == value
        )
        if not same:
            setattr(item, field, value)
            changed.append(field)
    if body.remarks:
        item.remarks = body.remarks
        changed.append("remarks")
    if hotspot.material_id and item.material_id is None:
        item.material_id = hotspot.material_id
        changed.append("material_id")

    if set(_PRICING_INPUTS) & set(changed):
        item.initial_price = None
        if item.status == QuotationItemStatus.pending_clarity:
            item.status = QuotationItemStatus.draft
        resolve_line_item(item)

    hotspot.quotation_line_item_id = item.id
    db.add(
        AuditLog(
            user_id=user_id,
            action="quotation_item_updated",
            entity_type="quotation_line_item",
            entity_id=str(item.id),
            payload={
                "fields": sorted(changed),
                "source": "design_hotspot",
                "hotspot_id": str(hotspot.id),
            },
            timestamp=datetime.utcnow(),
        )
    )
    return item


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

    if body.update_item_id is not None:
        return _update_existing_item(db, client_id, hotspot, body, user_id)

    material = hotspot.material
    unit = body.unit or (material.unit if material else None)
    if not unit:
        raise HotspotQuotationError(
            "Choose a unit; this hotspot has no material to take it from", 422
        )

    quotation = _ensure_quotation(db, client_id, user_id)
    if quotation.status == QuotationStatus.approved:
        raise HotspotQuotationError(APPROVED_MESSAGE, 409)

    description = body.description or hotspot.label
    # Same gate as every other source: house room spelling, and no silent
    # duplicate of a line that is already there.
    try:
        decision = decide(
            body.room, description, quotation.line_items, action="add"
        )
        refuse_duplicate(decision, body.allow_duplicate)
    except IntakeRejected as rejected:
        raise HotspotQuotationError(
            str(rejected), rejected.status_code
        ) from rejected
    room = decision.room
    description = decision.description

    rate = body.rate
    if rate is None and material is not None:
        rate = float(material.unit_cost)

    item = QuotationLineItem(
        quotation_id=quotation.id,
        room=room,
        # Append after the existing lines.
        position=max((i.position for i in quotation.line_items), default=-1)
        + 1,
        description=description,
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
