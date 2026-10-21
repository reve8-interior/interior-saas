"""
Excel quotation importer.

Parses real-world Indian interior-design quotation workbooks — inline
room headers, dimension strings in the Qty column, comparative price
columns (designer amount vs client counter-offer), and negotiation
remarks — into structured line items ready for the quotation_line_items
table.

The importer is faithful: prices come from the sheet's cells, never
recomputed. Dimension strings are resolved to sqft via
services.dimension_parser; anything unparseable is preserved raw and
the item is flagged pending_clarity.
"""

from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path

from openpyxl import load_workbook

from ..models.quotation_line_item import (
    QuotationCatalogType,
    QuotationItemStatus,
)
from .dimension_parser import normalize_unit, parse_dimension

# Sheet1 (1) layout (1-based): B=item, F=unit, G=qty-or-dimension,
# H=rate, I=amount (designer), J=remarks, K=counter offer (client).
_CORE_SHEET = "Sheet1 (1)"
_CORE_COLS = {
    "item": 1,
    "unit": 5,
    "qty": 6,
    "rate": 7,
    "amount": 8,
    "remarks": 9,
    "offer": 10,
}

# Sheet3 (1) layout: A=item, E=unit, F=qty-or-dimension, G=rate,
# H=amount (designer), I=counter offer.
_FURNITURE_SHEET = "Sheet3 (1)"
_FURNITURE_COLS = {
    "item": 0,
    "unit": 4,
    "qty": 5,
    "rate": 6,
    "amount": 7,
    "remarks": None,
    "offer": 8,
}

_HEADER_ROW_MARKER = "item category"
_TOTAL_MARKER = "total"
_END_OF_ITEMS_MARKER = "the following items"
_NOT_REQUIRED_MARKER = "not required"


@dataclass(frozen=True)
class ImportedItem:
    """One parsed quotation row, ready to map onto QuotationLineItem."""

    room: str
    description: str
    unit: str
    catalog_type: QuotationCatalogType
    raw_dimension: str | None
    computed_sqft: Decimal | None
    qty: Decimal | None
    rate: Decimal | None
    initial_price: Decimal | None
    negotiated_price: Decimal | None
    remarks: str | None
    status: QuotationItemStatus


@dataclass
class ImportResult:
    items: list[ImportedItem] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


def _text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _decimal(value: object) -> Decimal | None:
    """Cell → Decimal; garbage like '????' or blanks becomes None."""
    text = _text(value)
    if text is None:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def _derive_status(
    initial: Decimal | None,
    negotiated: Decimal | None,
    remarks: str | None,
) -> QuotationItemStatus:
    """
    Deterministic negotiation-state mapping:
    - "not required" in remarks        → removed
    - both prices agree                → agreed
    - counter-offer differs            → priced (still negotiating)
    - no counter-offer, has remarks    → pending_clarity
    - designer price only              → priced
    - no usable price at all           → pending_clarity
    """
    if remarks and _NOT_REQUIRED_MARKER in remarks.lower():
        return QuotationItemStatus.removed
    if negotiated is not None and initial is not None:
        return (
            QuotationItemStatus.agreed
            if negotiated == initial
            else QuotationItemStatus.priced
        )
    if negotiated is None and remarks:
        return QuotationItemStatus.pending_clarity
    if initial is not None and initial > 0:
        return QuotationItemStatus.priced
    if negotiated is not None:
        return QuotationItemStatus.priced
    return QuotationItemStatus.pending_clarity


def _build_item(
    room: str,
    description: str,
    catalog_type: QuotationCatalogType,
    cells: dict[str, object],
) -> ImportedItem:
    unit_raw = _text(cells["unit"]) or "lumpsum"
    unit = normalize_unit(unit_raw)
    qty_cell = cells["qty"]

    raw_dimension: str | None = None
    computed_sqft: Decimal | None = None
    qty = _decimal(qty_cell)
    # Non-numeric qty (e.g. 6'3"x1'6") is a dimension string.
    if qty is None and _text(qty_cell):
        raw_dimension = _text(qty_cell)
        parsed = parse_dimension(raw_dimension or "")
        computed_sqft = parsed.sqft if parsed else None

    initial = _decimal(cells["amount"])
    if initial is not None and initial == 0:
        initial = None
    negotiated = _decimal(cells["offer"])
    remarks = _text(cells.get("remarks"))

    status = _derive_status(initial, negotiated, remarks)
    # A dimension we could not parse always needs human review.
    if raw_dimension and computed_sqft is None:
        status = QuotationItemStatus.pending_clarity

    return ImportedItem(
        room=room,
        description=description,
        unit=unit,
        catalog_type=catalog_type,
        raw_dimension=raw_dimension,
        computed_sqft=computed_sqft,
        qty=qty,
        rate=_decimal(cells["rate"]),
        initial_price=initial,
        negotiated_price=negotiated,
        remarks=remarks,
        status=status,
    )


def _parse_core_sheet(rows: list[tuple], result: ImportResult) -> None:
    room: str | None = None
    for index, row in enumerate(rows, start=1):
        cells = {
            key: (row[col] if col is not None and col < len(row) else None)
            for key, col in _CORE_COLS.items()
        }
        item_name = _text(cells["item"])
        if not item_name:
            if any(_text(v) for v in cells.values()):
                result.skipped.append(
                    f"{_CORE_SHEET} row {index}: values without an item name"
                )
            continue

        lowered = item_name.lower()
        if lowered.startswith(_END_OF_ITEMS_MARKER):
            break
        if lowered == _HEADER_ROW_MARKER:
            continue

        has_data = any(
            _text(cells[key])
            for key in ("unit", "qty", "rate", "amount", "offer")
        )
        # Room-total rows carry only price cells; real items have unit/qty.
        if lowered.rstrip() == _TOTAL_MARKER and not any(
            _text(cells[key]) for key in ("unit", "qty", "rate")
        ):
            continue
        if not has_data:
            room = item_name
            continue
        if room is None:
            result.skipped.append(
                f"{_CORE_SHEET} row {index}: item before any room header"
            )
            continue

        result.items.append(
            _build_item(
                room, item_name, QuotationCatalogType.core_works, cells
            )
        )


def _parse_furniture_sheet(rows: list[tuple], result: ImportResult) -> None:
    for index, row in enumerate(rows, start=1):
        cells = {
            key: (row[col] if col is not None and col < len(row) else None)
            for key, col in _FURNITURE_COLS.items()
        }
        item_name = _text(cells["item"])
        if not item_name:
            continue
        lowered = item_name.lower()
        if lowered == "furniture":
            continue
        if lowered == _TOTAL_MARKER:
            continue
        has_data = any(
            _text(cells[key])
            for key in ("unit", "qty", "rate", "amount", "offer")
        )
        if not has_data:
            result.skipped.append(
                f"{_FURNITURE_SHEET} row {index}: no data for '{item_name}'"
            )
            continue
        result.items.append(
            _build_item(
                "Furniture",
                item_name,
                QuotationCatalogType.loose_furniture,
                cells,
            )
        )


def parse_workbook(path: Path) -> ImportResult:
    """Parse a quotation workbook into ordered, structured line items."""
    workbook = load_workbook(path, data_only=True)
    result = ImportResult()

    core = workbook[_CORE_SHEET]
    _parse_core_sheet(
        [row for row in core.iter_rows(values_only=True)], result
    )

    if _FURNITURE_SHEET in workbook.sheetnames:
        furniture = workbook[_FURNITURE_SHEET]
        _parse_furniture_sheet(
            [row for row in furniture.iter_rows(values_only=True)], result
        )

    return result
