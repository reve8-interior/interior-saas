"""Freeze a quotation into a numbered version and render it for sharing."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..models.audit import AuditLog
from ..models.client import Client, ProjectPhase
from ..models.design import Design
from ..models.quotation import Quotation
from ..models.quotation_line_item import (
    QuotationCatalogType,
    QuotationItemStatus,
    QuotationLineItem,
)
from ..models.quotation_version import QuotationVersion
from ..schemas.quotation import QuotationLineItemRead
from ..schemas.quotation_version import (
    QuotationVersionSummary,
    SharedQuotationItem,
    SharedQuotationRoom,
)
from .quotation_service import (
    _effective_price,
    build_quotation_view,
    resolve_line_item,
)


class EmptyQuotationError(Exception):
    """There is nothing to freeze into a version."""


class AttachmentError(Exception):
    """Rooms or designs for a version are invalid; carries an HTTP status."""

    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


def validate_room_designs(
    db: Session,
    client_id: uuid.UUID,
    version_rooms: set[str],
    room_designs: dict[str, list[uuid.UUID]],
) -> dict[str, list[str]]:
    """Rooms must exist in the version; designs must be the client's."""
    if not set(room_designs) <= version_rooms:
        raise AttachmentError("Unknown room", 422)
    wanted = {d for ids in room_designs.values() for d in ids}
    if wanted:
        owned = set(
            db.execute(
                select(Design.id)
                .where(Design.client_id == client_id)
                .where(Design.id.in_(wanted))
            )
            .scalars()
            .all()
        )
        if owned != wanted:
            raise AttachmentError("Design not found", 404)
    return {
        room: [str(d) for d in dict.fromkeys(ids)]
        for room, ids in room_designs.items()
        if ids
    }


def default_room_designs(
    db: Session, client_id: uuid.UUID, version_rooms: set[str]
) -> dict[str, list[str]]:
    """Attach each design to the rooms it is tagged with (case-insensitive)."""
    by_key = {r.casefold(): r for r in version_rooms}
    attached: dict[str, list[str]] = {}
    designs = (
        db.execute(
            select(Design)
            .where(Design.client_id == client_id)
            .order_by(Design.created_at)
        )
        .scalars()
        .all()
    )
    for design in designs:
        for tag in design.rooms or []:
            room = by_key.get(tag.casefold())
            if room:
                attached.setdefault(room, []).append(str(design.id))
    return attached


def create_version(
    db: Session,
    quotation: Quotation,
    user_id: uuid.UUID,
    label: str | None = None,
    room_designs: dict[str, list[uuid.UUID]] | None = None,
) -> QuotationVersion:
    """Snapshot the live line items as the next numbered version.

    `room_designs` None means: attach designs by their own room tags.
    """
    items = [
        QuotationLineItemRead.model_validate(i).model_dump(mode="json")
        for i in quotation.line_items
    ]
    if not items:
        raise EmptyQuotationError("Cannot save an empty quotation")

    rooms = {i["room"] for i in items}
    attached = (
        default_room_designs(db, quotation.client_id, rooms)
        if room_designs is None
        else validate_room_designs(
            db, quotation.client_id, rooms, room_designs
        )
    )
    view = build_quotation_view(quotation)
    return _store_version(
        db,
        quotation,
        user_id,
        label,
        items,
        view.initial_total,
        view.negotiated_total,
        attached,
        quotation.checkpoint_id,
        "quotation_version_created",
    )


def create_version_from_rows(
    db: Session,
    quotation: Quotation,
    user_id: uuid.UUID,
    label: str | None,
    rows: list[dict],
) -> QuotationVersion:
    """Store rows read from an edited Excel export as the next version.

    The live quotation is left untouched. Derived fields (sqft, price,
    status) are resolved the same way as for a manually entered item.
    """
    now = datetime.now(timezone.utc)
    resolved: list[QuotationLineItem] = []
    for position, row in enumerate(rows):
        item = QuotationLineItem(
            id=uuid.uuid4(),
            quotation_id=quotation.id,
            position=position,
            catalog_type=QuotationCatalogType.core_works,
            created_at=now,
            updated_at=now,
            **row,
        )
        resolved.append(resolve_line_item(item))
    if not resolved:
        raise EmptyQuotationError("The file has no line items")

    initial = sum(
        (
            Decimal(str(i.initial_price))
            for i in resolved
            if i.initial_price is not None
            and i.status != QuotationItemStatus.removed
        ),
        Decimal("0"),
    )
    negotiated = sum((_effective_price(i) for i in resolved), Decimal("0"))
    items = [
        QuotationLineItemRead.model_validate(i).model_dump(mode="json")
        for i in resolved
    ]
    attached = default_room_designs(
        db, quotation.client_id, {i["room"] for i in items}
    )
    return _store_version(
        db,
        quotation,
        user_id,
        label,
        items,
        float(initial),
        float(negotiated),
        attached,
        None,
        "quotation_version_imported",
    )


def _store_version(
    db: Session,
    quotation: Quotation,
    user_id: uuid.UUID,
    label: str | None,
    items: list[dict],
    initial_total: float,
    negotiated_total: float,
    attached: dict[str, list[str]],
    checkpoint_id: uuid.UUID | None,
    audit_action: str,
) -> QuotationVersion:
    number = (
        db.scalar(
            select(func.max(QuotationVersion.number)).where(
                QuotationVersion.quotation_id == quotation.id
            )
        )
        or 0
    ) + 1
    version = QuotationVersion(
        quotation_id=quotation.id,
        number=number,
        label=label.strip() if label and label.strip() else None,
        line_items=items,
        initial_total=initial_total,
        negotiated_total=negotiated_total,
        room_designs=attached,
        checkpoint_id=checkpoint_id,
        created_by_id=user_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(version)
    db.add(
        AuditLog(
            user_id=user_id,
            action=audit_action,
            entity_type="quotation",
            entity_id=str(quotation.id),
            payload={"number": number, "label": version.label},
            timestamp=datetime.utcnow(),
        )
    )
    db.flush()
    return version


# Phases before the work starts; agreeing a quotation moves these forward.
_PRE_IMPLEMENTATION = (
    ProjectPhase.discussion,
    ProjectPhase.design,
    ProjectPhase.quotation,
)


def agree_version(
    db: Session, version: QuotationVersion, user_id: uuid.UUID
) -> None:
    """Mark a version as the one agreed with the client.

    Replaces any earlier agreed version of the same quotation and moves a
    client still in discussion/design/quotation to implementation.
    """
    now = datetime.now(timezone.utc)
    db.execute(
        update(QuotationVersion)
        .where(
            QuotationVersion.quotation_id == version.quotation_id,
            QuotationVersion.is_agreed.is_(True),
        )
        .values(is_agreed=False, agreed_at=None, agreed_by_id=None)
    )
    version.is_agreed = True
    version.agreed_at = now
    version.agreed_by_id = user_id
    db.add(
        AuditLog(
            user_id=user_id,
            action="quotation_version_agreed",
            entity_type="quotation",
            entity_id=str(version.quotation_id),
            payload={"number": version.number},
            timestamp=datetime.utcnow(),
        )
    )
    quotation = db.get(Quotation, version.quotation_id)
    client = db.get(Client, quotation.client_id) if quotation else None
    if client and client.current_phase in _PRE_IMPLEMENTATION:
        db.add(
            AuditLog(
                user_id=user_id,
                action="phase_changed",
                entity_type="client",
                entity_id=str(client.id),
                payload={
                    "from": client.current_phase,
                    "to": ProjectPhase.implementation,
                },
                timestamp=datetime.utcnow(),
            )
        )
        client.current_phase = ProjectPhase.implementation
    db.flush()


def to_summary(version: QuotationVersion) -> QuotationVersionSummary:
    return QuotationVersionSummary(
        id=version.id,
        quotation_id=version.quotation_id,
        number=version.number,
        label=version.label,
        item_count=len(version.line_items),
        room_designs={
            room: [uuid.UUID(d) for d in ids]
            for room, ids in (version.room_designs or {}).items()
        },
        initial_total=float(version.initial_total),
        negotiated_total=float(version.negotiated_total),
        checkpoint_id=version.checkpoint_id,
        is_active=version.is_active,
        is_agreed=version.is_agreed,
        agreed_at=version.agreed_at,
        created_at=version.created_at,
    )


def _amount(item: QuotationLineItemRead) -> float:
    price = (
        item.negotiated_price
        if item.negotiated_price is not None
        else item.initial_price
    )
    return price or 0.0


def shared_rooms(
    version: QuotationVersion, show_prices: bool
) -> tuple[list[SharedQuotationRoom], float | None]:
    """Room groups for the customer.

    Built field by field, so internal data (remarks, custom columns,
    status, and prices when hidden) can never leak by accident.
    """
    rooms: dict[str, list[SharedQuotationItem]] = {}
    totals: dict[str, float] = {}
    for raw in version.line_items:
        item = QuotationLineItemRead.model_validate(raw)
        if item.status == QuotationItemStatus.removed:
            continue
        amount = _amount(item)
        rooms.setdefault(item.room, []).append(
            SharedQuotationItem(
                description=item.description,
                unit=item.unit,
                raw_dimension=item.raw_dimension,
                qty=item.qty,
                est_time=item.est_time,
                rate=item.rate if show_prices else None,
                amount=amount if show_prices else None,
            )
        )
        totals[item.room] = totals.get(item.room, 0.0) + amount

    groups = [
        SharedQuotationRoom(
            room=room,
            items=items,
            total=totals[room] if show_prices else None,
        )
        for room, items in rooms.items()
    ]
    return groups, (sum(totals.values()) if show_prices else None)
