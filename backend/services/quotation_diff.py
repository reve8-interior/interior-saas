"""
Quotation comparison: what was added, removed, or changed between a
saved snapshot (the state before a checkpoint was applied) and the
current line items.

Items are paired with the same room + description matching used by
services.checkpoint_merge, so the diff agrees with how checkpoints
merge into the quotation.
"""

from __future__ import annotations

from decimal import Decimal

from ..models.quotation_line_item import QuotationLineItem
from ..schemas.quotation import (
    DiffFieldChange,
    QuotationDiffChange,
    QuotationDiffItem,
)
from .checkpoint_merge import (
    DESCRIPTION_MATCH_THRESHOLD,
    description_similarity,
    find_matching_item,
    normalize_text,
)

# Fields compared for matched items, in display order.
_COMPARED_FIELDS = (
    "description",
    "unit",
    "raw_dimension",
    "qty",
    "rate",
    "initial_price",
    "negotiated_price",
    "est_time",
    "remarks",
    "status",
)


def _canonical(value: object) -> str | float | None:
    """Normalize a field value so ORM and snapshot sides compare equal."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, float)):
        return float(value)
    if hasattr(value, "value"):  # enum
        return str(value.value)
    return str(value)


def _current_to_dict(item: QuotationLineItem) -> dict:
    return {
        "room": item.room,
        "description": item.description,
        "unit": item.unit,
        "raw_dimension": item.raw_dimension,
        "qty": item.qty,
        "rate": item.rate,
        "initial_price": item.initial_price,
        "negotiated_price": item.negotiated_price,
        "est_time": item.est_time,
        "remarks": item.remarks,
        "status": item.status,
        "extra": dict(item.extra or {}),
    }


def _to_diff_item(raw: dict) -> QuotationDiffItem:
    values = {f: _canonical(raw.get(f)) for f in _COMPARED_FIELDS}
    extra = {
        str(k): _canonical(v) for k, v in (raw.get("extra") or {}).items()
    }
    return QuotationDiffItem(
        extra=extra,
        room=str(raw.get("room", "")),
        description=str(values["description"] or ""),
        unit=values["unit"] if isinstance(values["unit"], str) else None,
        raw_dimension=(
            values["raw_dimension"]
            if isinstance(values["raw_dimension"], str)
            else None
        ),
        qty=values["qty"] if isinstance(values["qty"], float) else None,
        rate=values["rate"] if isinstance(values["rate"], float) else None,
        initial_price=(
            values["initial_price"]
            if isinstance(values["initial_price"], float)
            else None
        ),
        negotiated_price=(
            values["negotiated_price"]
            if isinstance(values["negotiated_price"], float)
            else None
        ),
        est_time=(
            values["est_time"] if isinstance(values["est_time"], str) else None
        ),
        remarks=(
            values["remarks"] if isinstance(values["remarks"], str) else None
        ),
        status=values["status"] if isinstance(values["status"], str) else None,
    )


def _best_baseline_match(
    current: dict, baseline_pool: list[tuple[int, dict]]
) -> int | None:
    """Index (into baseline_pool) of the best-matching baseline item."""
    room_norm = normalize_text(str(current.get("room", "")))
    best_idx: int | None = None
    best_score = 0.0
    for pool_idx, (_, base) in enumerate(baseline_pool):
        if normalize_text(str(base.get("room", ""))) != room_norm:
            continue
        score = description_similarity(
            str(base.get("description", "")),
            str(current.get("description", "")),
        )
        if score > best_score:
            best_idx, best_score = pool_idx, score
    if best_idx is not None and best_score >= DESCRIPTION_MATCH_THRESHOLD:
        return best_idx
    return None


def compute_quotation_diff(
    current_items: list[QuotationLineItem] | list[dict],
    baseline_items: list[dict],
) -> tuple[
    list[QuotationDiffItem],
    list[QuotationDiffItem],
    list[QuotationDiffChange],
    int,
]:
    """Compare a target state against a baseline snapshot's items.

    The target side accepts live ORM line items or snapshot dicts, so the
    same function diffs "current vs snapshot" and "snapshot vs snapshot"
    (what one checkpoint changed).

    Returns (added, removed, changed, unchanged_count) where `added`
    exists only in the target, `removed` only in the baseline, and
    `changed` pairs differ in at least one compared field.
    """
    added: list[QuotationDiffItem] = []
    changed: list[QuotationDiffChange] = []
    unchanged = 0

    pool: list[tuple[int, dict]] = list(enumerate(baseline_items))

    for item in current_items:
        current = item if isinstance(item, dict) else _current_to_dict(item)
        match_pool_idx = _best_baseline_match(current, pool)
        if match_pool_idx is None:
            added.append(_to_diff_item(current))
            continue
        _, base = pool.pop(match_pool_idx)
        field_changes = [
            DiffFieldChange(
                field=f,
                old=_canonical(base.get(f)),
                new=_canonical(current.get(f)),
            )
            for f in _COMPARED_FIELDS
            if _canonical(base.get(f)) != _canonical(current.get(f))
        ]
        # User-defined custom columns: compare the union of keys
        cur_extra: dict = current.get("extra") or {}
        base_extra: dict = base.get("extra") or {}
        for key in sorted(set(cur_extra) | set(base_extra)):
            if _canonical(base_extra.get(key)) != _canonical(
                cur_extra.get(key)
            ):
                field_changes.append(
                    DiffFieldChange(
                        field=str(key),
                        old=_canonical(base_extra.get(key)),
                        new=_canonical(cur_extra.get(key)),
                    )
                )
        if field_changes:
            changed.append(
                QuotationDiffChange(
                    room=str(current["room"]),
                    description=str(current["description"]),
                    changes=field_changes,
                )
            )
        else:
            unchanged += 1

    removed = [_to_diff_item(base) for _, base in pool]
    return added, removed, changed, unchanged


def attach_item_ids(
    entries: list[QuotationDiffItem] | list[QuotationDiffChange],
    current_items: list[QuotationLineItem],
) -> None:
    """Resolve each diff entry to a live line item id (for navigation).

    Uses the same room+description matching as the merge, so an entry
    points at the quotation row it would merge into. Entries whose item
    no longer exists (e.g. removed work) keep item_id=None.
    """
    for entry in entries:
        match = find_matching_item(
            entry.room, entry.description, list(current_items)
        )
        entry.item_id = (
            str(match.id) if match is not None and match.id else None
        )
