"""
Deterministic draft of quotation rows from confirmed floor-plan rooms.

Which items a room gets comes from a per-room-type template; each item's
size (and so its dimension string and quantity) comes from the room's
dimensions; rates come from the business's own past rates for a similar
description and stay blank when there is no match. Nothing here asks a
model to choose or price anything.

Add a room type by adding one RoomTemplate to TEMPLATES.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Callable, Sequence

from ..models.quotation_line_item import QuotationLineItem
from ..schemas.floorplan import DraftItem, DraftMatch, FloorPlanRoomOut
from .checkpoint_merge import (
    DESCRIPTION_MATCH_THRESHOLD,
    description_similarity,
)
from .checkpoint_ai_support import item_summary
from .dimension_parser import normalize_unit
from .intake import find_similar
from .quotation_context import canonical_room

MIN_SIDE_FT = 3.0
MAX_SIDE_FT = 60.0
MAX_AREA_SQFT = 2500.0
WARDROBE_HEIGHT_FT = 7.0
KITCHEN_CABINET_DEPTH_FT = 2.5


@dataclass(frozen=True)
class PendingRow:
    """A row in an earlier draft that is not in the quotation yet."""

    room: str
    description: str


Dims = tuple[float, float]  # (length, width) in feet
Size = Callable[[Dims], Dims]  # the item's two sides, in feet


@dataclass(frozen=True)
class TemplateItem:
    """One starter row. size=None means a counted item (qty 1)."""

    description: str
    unit: str
    size: Size | None = None


@dataclass(frozen=True)
class RoomTemplate:
    keywords: tuple[str, ...]
    items: tuple[TemplateItem, ...]


def _wardrobe(d: Dims) -> Dims:
    return (min(d), WARDROBE_HEIGHT_FT)


def _kitchen_cabinets(d: Dims) -> Dims:
    return (d[0] + d[1], KITCHEN_CABINET_DEPTH_FT)


def _ceiling(d: Dims) -> Dims:
    return d


def _fixed(a: float, b: float) -> Size:
    return lambda _: (a, b)


TEMPLATES: tuple[RoomTemplate, ...] = (
    RoomTemplate(
        ("bedroom", "bed room"),
        (
            TemplateItem("Wardrobe", "sqft", _wardrobe),
            TemplateItem("Bed back panel", "nos"),
            TemplateItem("False ceiling", "sqft", _ceiling),
        ),
    ),
    RoomTemplate(
        ("kitchen",),
        (
            TemplateItem(
                "Kitchen base and wall cabinets", "sqft", _kitchen_cabinets
            ),
            TemplateItem("False ceiling", "sqft", _ceiling),
        ),
    ),
    RoomTemplate(
        ("living", "hall", "lounge"),
        (
            TemplateItem("TV unit", "sqft", _fixed(8, 7)),
            TemplateItem("False ceiling", "sqft", _ceiling),
        ),
    ),
    RoomTemplate(
        ("dining",),
        (TemplateItem("Crockery unit", "sqft", _fixed(5, 7)),),
    ),
    RoomTemplate(
        ("pooja", "puja", "prayer"),
        (TemplateItem("Pooja unit", "nos"),),
    ),
    RoomTemplate(
        ("bath", "toilet", "wc", "washroom"),
        (TemplateItem("Vanity unit", "nos"),),
    ),
)

RateBook = Sequence[tuple[str, str, float]]


def template_for(room_name: str) -> RoomTemplate | None:
    name = room_name.lower()
    return next(
        (t for t in TEMPLATES if any(k in name for k in t.keywords)), None
    )


def room_warnings(room: FloorPlanRoomOut) -> list[str]:
    """Why a room's dimensions look wrong, in plain words."""
    label = room.plan_label or room.name
    if room.length_ft is None or room.width_ft is None:
        return [f"{label}: no dimensions — add them to get quantities."]
    out: list[str] = []
    for side in (room.length_ft, room.width_ft):
        if not MIN_SIDE_FT <= side <= MAX_SIDE_FT:
            out.append(
                f"{label}: {side:g} ft is outside "
                f"{MIN_SIDE_FT:g}–{MAX_SIDE_FT:g} ft — check the units."
            )
            break
    if room.length_ft * room.width_ft > MAX_AREA_SQFT:
        out.append(f"{label}: area is unusually large — check it.")
    return out


def rate_for(description: str, unit: str, rate_book: RateBook) -> float | None:
    """Median past rate for a similar description in the same unit."""
    rates = [
        rate
        for desc, u, rate in rate_book
        if u == unit
        and description_similarity(description, desc)
        >= DESCRIPTION_MATCH_THRESHOLD
    ]
    return float(median(rates)) if rates else None


def _match_for(
    room: str,
    template_item: TemplateItem,
    draft: DraftItem,
    existing: Sequence[QuotationLineItem],
    pending: Sequence[PendingRow] = (),
) -> DraftMatch | None:
    """The line or earlier draft row this starter row repeats."""
    snapped = canonical_room(room, [i.room for i in existing])
    line = find_similar(snapped, template_item.description, existing)
    if line is None:
        return _pending_match(room, template_item.description, pending)
    fills: list[str] = []
    if normalize_unit(line.unit) == normalize_unit(draft.unit):
        if line.raw_dimension is None and line.qty is None:
            if draft.raw_dimension:
                fills.append("raw_dimension")
            if draft.qty is not None:
                fills.append("qty")
        if line.rate is None and draft.rate is not None:
            fills.append("rate")
    return DraftMatch(id=str(line.id), summary=item_summary(line), fills=fills)


def _pending_match(
    room: str, description: str, pending: Sequence[PendingRow]
) -> DraftMatch | None:
    """An earlier draft row in the same room with a similar description."""
    rooms = list(dict.fromkeys(p.room for p in pending))
    snapped = canonical_room(room, rooms)
    for row in pending:
        if (
            row.room == snapped
            and description_similarity(row.description, description)
            >= DESCRIPTION_MATCH_THRESHOLD
        ):
            return DraftMatch(
                source="draft", summary=f"{row.room} — {row.description}"
            )
    return None


def _feet(value: float) -> str:
    return f"{round(value, 2):g}'"


def draft_items(
    rooms: Sequence[FloorPlanRoomOut],
    rate_book: RateBook,
    existing: Sequence[QuotationLineItem] = (),
    pending: Sequence[PendingRow] = (),
) -> tuple[list[DraftItem], list[str]]:
    """Template rows for each confirmed room, plus warnings to show."""
    items: list[DraftItem] = []
    warnings: list[str] = []
    for room in rooms:
        warnings.extend(room_warnings(room))
        template = template_for(room.name)
        if template is None:
            warnings.append(f"{room.name}: no starter items for this room.")
            continue
        dims: Dims | None = (
            (room.length_ft, room.width_ft)
            if room.length_ft is not None and room.width_ft is not None
            else None
        )
        for t in template.items:
            raw_dimension: str | None = None
            qty: float | None = 1.0 if t.size is None else None
            if t.size is not None and dims is not None:
                a, b = t.size(dims)
                raw_dimension = f"{_feet(a)}x{_feet(b)}"
                qty = round(a * b, 1)
            draft = DraftItem(
                room=room.name,
                description=t.description,
                unit=t.unit,
                raw_dimension=raw_dimension,
                qty=qty,
                rate=rate_for(t.description, t.unit, rate_book),
            )
            draft.match = _match_for(room.name, t, draft, existing, pending)
            items.append(draft)
    return items, warnings
