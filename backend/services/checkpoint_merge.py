"""
Checkpoint → quotation merge logic.

The quotation's live line items are the single accumulated state of the
project scope. Each new checkpoint MERGES into that state instead of
appending: an extracted item that refers to work already on the quotation
UPDATES the existing line item; only genuinely new work is appended.

Matching is deterministic and never calls an LLM. It prefers an exact
anchor — `target_item_id`, carried through from the ref the extraction
agent was shown (services.extraction_postprocess) — and falls back to
normalization + token-sort similarity for items that arrive without one
(manual entry, older checkpoints, imports).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Protocol
from uuid import UUID

from sqlalchemy.orm import Session

from ..models.quotation import Quotation
from ..models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from .dimension_parser import normalize_unit
from .quotation_service import resolve_line_item

# Similarity (0..1) above which two descriptions in the same room are
# considered the same work item. 0.72 tolerates rewording ("wardrobe with
# sliding doors" vs "sliding door wardrobe") without conflating distinct
# items ("wardrobe" vs "study table").
DESCRIPTION_MATCH_THRESHOLD = 0.72

# Fields whose change invalidates previously derived pricing and any
# prior agreement on the item (mirrors routers.quotations._DERIVED_INPUTS).
_PRICING_INPUTS = ("unit", "raw_dimension", "qty", "rate")


class IncomingItem(Protocol):
    """Shape of a confirmed checkpoint line item (router-agnostic).

    `action` and `target_item_id` are optional: items that predate the
    delta-aware agent, or that a designer typed by hand, simply behave
    as un-anchored adds and fall through to similarity matching.
    """

    room: str
    description: str
    unit: str
    raw_dimension: str | None
    qty: float | None
    rate: float | None
    est_time: str | None
    remarks: str | None
    catalog_type: str
    extra: dict[str, object]


@dataclass
class MergeResult:
    """Outcome of merging one checkpoint into a quotation."""

    added: int = 0
    updated: int = 0
    # Items this checkpoint contributed on a previous apply and that are
    # no longer in its list — hard-deleted as part of re-applying it.
    removed: int = 0
    # Items the client dropped in this meeting — soft-marked `removed`
    # so they stay visible, priced at zero, in the quotation history.
    marked_removed: int = 0
    updated_item_ids: list[str] = field(default_factory=list)


def normalize_text(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _token_sort(text: str) -> str:
    return " ".join(sorted(normalize_text(text).split()))


def description_similarity(a: str, b: str) -> float:
    """Word-order-insensitive similarity between two descriptions."""
    norm_a, norm_b = _token_sort(a), _token_sort(b)
    if not norm_a or not norm_b:
        return 0.0
    if norm_a == norm_b:
        return 1.0
    return SequenceMatcher(None, norm_a, norm_b).ratio()


def find_matching_item(
    room: str,
    description: str,
    candidates: list[QuotationLineItem],
) -> QuotationLineItem | None:
    """Best existing item in the same room describing the same work.

    Returns None when nothing scores above DESCRIPTION_MATCH_THRESHOLD.
    """
    room_norm = normalize_text(room)
    best: QuotationLineItem | None = None
    best_score = 0.0
    for item in candidates:
        if normalize_text(item.room) != room_norm:
            continue
        score = description_similarity(item.description, description)
        if score > best_score:
            best, best_score = item, score
    if best is not None and best_score >= DESCRIPTION_MATCH_THRESHOLD:
        return best
    return None


def _anchor_id(incoming: IncomingItem) -> str | None:
    """The explicit line-item id this incoming row edits, if any."""
    raw = getattr(incoming, "target_item_id", None)
    text = str(raw).strip() if raw else ""
    return text or None


def _action(incoming: IncomingItem) -> str:
    return (getattr(incoming, "action", None) or "add").strip().lower()


def _apply_update(
    item: QuotationLineItem,
    incoming: IncomingItem,
    checkpoint_id: UUID,
) -> None:
    """Overlay the newer checkpoint's info onto an existing line item.

    - Fields the client re-stated (non-None) win; unstated fields keep
      their current value — the quotation is the memory, a checkpoint is
      only the delta.
    - The longer description wins (assumed more complete).
    - A changed pricing input invalidates derived price, negotiated price,
      and any prior agreement: the item goes back into negotiation.
    """
    before = {f: getattr(item, f) for f in _PRICING_INPUTS}

    if len(incoming.description.strip()) > len(item.description.strip()):
        item.description = incoming.description.strip()
    if incoming.unit and incoming.unit.strip():
        # Normalize before the changed-fields comparison below, so a
        # mere case/spelling difference doesn't reset negotiation state.
        item.unit = normalize_unit(incoming.unit)
    if incoming.raw_dimension is not None:
        item.raw_dimension = incoming.raw_dimension
    if incoming.qty is not None:
        item.qty = incoming.qty
    if incoming.rate is not None:
        item.rate = incoming.rate
    if incoming.est_time:
        item.est_time = incoming.est_time
    if incoming.remarks:
        item.remarks = incoming.remarks
    if incoming.catalog_type:
        item.catalog_type = incoming.catalog_type
    if incoming.extra:
        # Overlay non-empty custom-column values; reassign so SQLAlchemy
        # detects the JSONB change.
        merged = dict(item.extra or {})
        for key, value in incoming.extra.items():
            if value is not None and value != "":
                merged[key] = value
        item.extra = merged

    def _num(value: object) -> object:
        return float(value) if isinstance(value, (int, float)) else value

    pricing_changed = any(
        _num(before[f]) != _num(getattr(item, f)) for f in _PRICING_INPUTS
    )
    if pricing_changed:
        item.initial_price = None
        item.negotiated_price = None
        if item.status in (
            QuotationItemStatus.agreed,
            QuotationItemStatus.pending_clarity,
            QuotationItemStatus.removed,
        ):
            item.status = QuotationItemStatus.draft
    resolve_line_item(item)
    item.source_checkpoint_id = checkpoint_id


def merge_checkpoint_items(
    quotation: Quotation,
    checkpoint_id: UUID,
    items_in: list[IncomingItem],
    db: Session,
) -> MergeResult:
    """Merge a checkpoint's confirmed items into the quotation state.

    - An item carrying `target_item_id` edits exactly that line item.
      This is the path the extraction agent takes: the ref it was shown
      resolves to an id, so an update can never drift onto a
      similarly-worded row in the same room.
    - Without an anchor, an incoming item that matches an existing line
      item (any checkpoint, or manually added) updates it in place.
    - Unmatched incoming items are appended.
    - `action="remove"` marks its target removed rather than deleting
      it, keeping the item — and its negotiation history — in the
      quotation record while excluding it from the total.
    - Items this same checkpoint contributed earlier but that are no
      longer in items_in are deleted (re-applying a checkpoint replaces
      its own contribution). Items from other checkpoints are never
      touched unless explicitly re-mentioned.
    """
    result = MergeResult()
    # Track by Python object identity: transient items have id=None
    # until flush, so DB ids cannot key this set.
    claimed: set[int] = set()
    by_id = {
        str(li.id): li for li in quotation.line_items if li.id is not None
    }

    for incoming in items_in:
        anchor = _anchor_id(incoming)
        match = by_id.get(anchor) if anchor else None
        if match is not None and id(match) in claimed:
            # Two rows in one checkpoint pointing at the same item: the
            # first already applied, so fold the second into it too.
            _apply_update(match, incoming, checkpoint_id)
            continue
        if match is None:
            candidates = [
                li for li in quotation.line_items if id(li) not in claimed
            ]
            match = find_matching_item(
                incoming.room, incoming.description, candidates
            )

        if _action(incoming) == "remove":
            if match is None:
                # Nothing to drop — a removal must never create a row.
                continue
            match.status = QuotationItemStatus.removed
            match.source_checkpoint_id = checkpoint_id
            claimed.add(id(match))
            result.marked_removed += 1
            if match.id is not None:
                result.updated_item_ids.append(str(match.id))
            continue

        if match is not None:
            _apply_update(match, incoming, checkpoint_id)
            claimed.add(id(match))
            result.updated += 1
            if match.id is not None:
                result.updated_item_ids.append(str(match.id))
        else:
            position = (
                max((li.position for li in quotation.line_items), default=-1)
                + 1
            )
            new_item = QuotationLineItem(
                quotation_id=quotation.id,
                source_checkpoint_id=checkpoint_id,
                room=incoming.room,
                description=incoming.description,
                # The agent may legitimately have no basis for a unit;
                # a blank one is caught by the required-column check.
                unit=(incoming.unit or "").strip(),
                raw_dimension=incoming.raw_dimension,
                qty=incoming.qty,
                rate=incoming.rate,
                est_time=incoming.est_time,
                remarks=incoming.remarks,
                catalog_type=incoming.catalog_type,
                extra=dict(incoming.extra or {}),
                position=position,
            )
            resolve_line_item(new_item)
            db.add(new_item)
            quotation.line_items.append(new_item)
            claimed.add(id(new_item))
            result.added += 1

    # Re-applying the same checkpoint: drop its stale leftovers.
    for li in list(quotation.line_items):
        if li.source_checkpoint_id == checkpoint_id and id(li) not in claimed:
            quotation.line_items.remove(li)
            db.delete(li)
            result.removed += 1
    db.flush()
    return result
