"""
Quotation line-item domain logic: dimension resolution, pricing,
room grouping, and the derived quotation state.

Routers stay thin; everything that decides a number or a status
lives here so it can be unit-tested without HTTP.
"""

from decimal import Decimal

from ..models.quotation import Quotation
from ..models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from ..schemas.quotation import (
    QuotationDerivedState,
    QuotationLineItemRead,
    QuotationRead,
    QuotationRoomGroup,
    QuotationSnapshot,
)
from .dimension_parser import normalize_unit, parse_dimension


def resolve_line_item(item: QuotationLineItem) -> QuotationLineItem:
    """
    Fill derived fields on a line item in place.

    - Parses raw_dimension into computed_sqft; an unparseable dimension
      flags the item pending_clarity rather than guessing.
    - Computes initial_price from sqft/qty x rate when not explicitly set.
    - Promotes draft items with a resolved price to priced.
    """
    item.unit = normalize_unit(item.unit)
    # Transient objects skip flush-time column defaults.
    if item.status is None:
        item.status = QuotationItemStatus.draft

    if item.raw_dimension:
        parsed = parse_dimension(item.raw_dimension)
        if parsed is None:
            item.computed_sqft = None
            item.status = QuotationItemStatus.pending_clarity
            return item
        item.computed_sqft = parsed.sqft

    if item.initial_price is None and item.rate is not None:
        if item.computed_sqft is not None:
            item.initial_price = Decimal(str(item.computed_sqft)) * Decimal(
                str(item.rate)
            )
        elif item.qty is not None:
            item.initial_price = Decimal(str(item.qty)) * Decimal(
                str(item.rate)
            )

    if (
        item.status == QuotationItemStatus.draft
        and item.initial_price is not None
    ):
        item.status = QuotationItemStatus.priced
    return item


def _effective_price(item: QuotationLineItem) -> Decimal:
    """Negotiated price wins; fall back to initial; removed items count 0."""
    if item.status == QuotationItemStatus.removed:
        return Decimal("0")
    price = (
        item.negotiated_price
        if item.negotiated_price is not None
        else item.initial_price
    )
    return Decimal(str(price)) if price is not None else Decimal("0")


def derive_state(items: list[QuotationLineItem]) -> QuotationDerivedState:
    """Quotation-level state is computed from item states, never stored."""
    active = [i for i in items if i.status != QuotationItemStatus.removed]
    if not active:
        return QuotationDerivedState.draft
    if any(i.status == QuotationItemStatus.pending_clarity for i in active):
        return QuotationDerivedState.clarification_needed
    if all(i.status == QuotationItemStatus.agreed for i in active):
        return QuotationDerivedState.ready_for_approval
    if any(
        i.status in (QuotationItemStatus.priced, QuotationItemStatus.agreed)
        for i in active
    ):
        return QuotationDerivedState.in_negotiation
    return QuotationDerivedState.draft


def build_quotation_view(quotation: Quotation) -> QuotationRead:
    """Full quotation view: metadata plus room groups in insertion order."""
    items = quotation.line_items
    rooms: dict[str, list[QuotationLineItem]] = {}
    for item in items:
        rooms.setdefault(item.room, []).append(item)

    room_groups: list[QuotationRoomGroup] = []
    grand_initial = Decimal("0")
    grand_negotiated = Decimal("0")
    total_pending = 0

    for room, room_items in rooms.items():
        initial = sum(
            (
                Decimal(str(i.initial_price))
                for i in room_items
                if i.initial_price is not None
                and i.status != QuotationItemStatus.removed
            ),
            Decimal("0"),
        )
        negotiated = sum(
            (_effective_price(i) for i in room_items), Decimal("0")
        )
        pending = sum(
            1
            for i in room_items
            if i.status == QuotationItemStatus.pending_clarity
        )
        room_groups.append(
            QuotationRoomGroup(
                room=room,
                items=[
                    QuotationLineItemRead.model_validate(i) for i in room_items
                ],
                initial_total=float(initial),
                negotiated_total=float(negotiated),
                pending_clarity_count=pending,
            )
        )
        grand_initial += initial
        grand_negotiated += negotiated
        total_pending += pending

    snapshots = [
        QuotationSnapshot(
            checkpoint_id=s.get("checkpoint_id", ""),
            created_at=s.get("created_at", ""),
            line_items=s.get("line_items", []),
        )
        for s in (quotation.snapshots or [])
        if not str(s.get("checkpoint_id", "")).startswith("pre-revert-")
    ]

    return QuotationRead(
        id=quotation.id,  # type: ignore[arg-type]
        client_id=quotation.client_id,
        design_id=quotation.design_id,
        checkpoint_id=quotation.checkpoint_id,  # type: ignore[arg-type]
        status=quotation.status.value
        if hasattr(quotation.status, "value")
        else quotation.status,
        created_at=quotation.created_at,
        rooms=room_groups,
        initial_total=float(grand_initial),
        negotiated_total=float(grand_negotiated),
        pending_clarity_count=total_pending,
        derived_state=derive_state(items),
        snapshots=snapshots,
    )
