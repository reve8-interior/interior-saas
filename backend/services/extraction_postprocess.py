"""
Deterministic normalisation of a raw agent extraction.

The agent reads the conversation; everything that can be decided by a
rule is decided here instead, so the same extraction always lands on the
same quotation rows. This layer is what lets the pipeline stay accurate
while the model stays free to be a language model:

  • ref → line-item id     — an update anchors on a real row, or it is
                             demoted to an add rather than guessing.
  • room canonicalisation  — "Kids Bedroom" snaps to the quotation's own
                             "Kids bed room"; no parallel rooms appear.
  • unit normalisation     — "Sqft"/"no's" collapse to canonical tokens.
  • field inheritance      — an update inherits unit and identity from
                             its target instead of restating them.
  • dimension validation   — an unparseable dimension is surfaced, never
                             silently multiplied out.
  • de-duplication         — one row per targeted item per checkpoint.

Every correction is recorded in `warnings` so the human verifying the
extraction can see what the pipeline changed and why.

No LLM calls, no DB access, no ORM types — pure functions over
duck-typed inputs, so the whole layer is unit-testable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from .checkpoint_merge import (
    DESCRIPTION_MATCH_THRESHOLD,
    description_similarity,
)
from .dimension_parser import normalize_unit, parse_dimension
from .quotation_context import ContextItem, ScopeContext, canonical_room

VALID_ACTIONS = ("add", "update", "remove")


@runtime_checkable
class RawItem(Protocol):
    """Shape of one item as the agent emitted it."""

    action: str
    target_ref: str | None
    room: str
    description: str
    unit: str | None
    raw_dimension: str | None
    qty: float | None
    rate: float | None
    est_time: str | None
    remarks: str | None


class RawExtraction(Protocol):
    meeting_minutes: list[str]
    line_items: list[RawItem]
    client_budget: float | None
    unmapped_notes: list[str]


class ExistingItem(Protocol):
    id: object
    room: str
    description: str
    unit: str


@dataclass
class NormalizedItem:
    """One extraction row, resolved against the live quotation."""

    action: str
    target_item_id: str | None
    room: str
    description: str
    unit: str | None
    raw_dimension: str | None
    qty: float | None
    rate: float | None
    est_time: str | None
    remarks: str | None


@dataclass
class NormalizedExtraction:
    meeting_minutes: list[str] = field(default_factory=list)
    line_items: list[NormalizedItem] = field(default_factory=list)
    client_budget: float | None = None
    unmapped_notes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ── Field-level cleaning ─────────────────────────────────────────────────────


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(str(value).split())
    return cleaned or None


def _clean_number(
    value: object, label: str, row: str, warnings: list[str]
) -> float | None:
    """Non-negative float, or None with a warning."""
    if value is None:
        return None
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        warnings.append(f"{row}: dropped unreadable {label} ({value!r}).")
        return None
    if number != number or number in (float("inf"), float("-inf")):
        warnings.append(f"{row}: dropped non-finite {label}.")
        return None
    if number < 0:
        warnings.append(f"{row}: dropped negative {label} ({number}).")
        return None
    return number


# ── Target resolution ────────────────────────────────────────────────────────


def _resolve_target(
    raw: RawItem,
    scope: ScopeContext,
    existing_items: list[ExistingItem],
    row: str,
    warnings: list[str],
) -> ContextItem | ExistingItem | None:
    """Find the live item an update/remove refers to.

    Tries the agent's ref first — the only path that is exact. Falls
    back to a room + description match over the whole quotation, so a
    hallucinated or omitted ref still lands correctly when the text is
    unambiguous. Returns None when nothing is confidently identified;
    the caller then demotes the action rather than editing a guess.
    """
    ref = (raw.target_ref or "").strip().upper()
    if ref:
        hit = scope.by_ref.get(ref)
        if hit is not None:
            return hit
        warnings.append(
            f"{row}: agent cited ref {ref}, which is not in the context "
            "sent to it — falling back to a description match."
        )

    room_key = canonical_room(raw.room, scope.known_rooms)
    best: ExistingItem | None = None
    best_score = 0.0
    for item in existing_items:
        if canonical_room(item.room, scope.known_rooms) != room_key:
            continue
        score = description_similarity(item.description, raw.description or "")
        if score > best_score:
            best, best_score = item, score
    if best is not None and best_score >= DESCRIPTION_MATCH_THRESHOLD:
        return best
    return None


def _target_id(target: ContextItem | ExistingItem) -> str:
    return str(getattr(target, "item_id", None) or getattr(target, "id"))


# ── Main entry point ─────────────────────────────────────────────────────────


def normalize_extraction(
    extraction: RawExtraction,
    scope: ScopeContext,
    existing_items: list[ExistingItem] | None = None,
) -> NormalizedExtraction:
    """Resolve a raw agent extraction against the live quotation."""
    existing = list(existing_items or [])
    by_id = {str(item.id): item for item in existing}
    warnings: list[str] = []
    notes = [
        n for n in (_clean_text(x) for x in extraction.unmapped_notes) if n
    ]

    out: list[NormalizedItem] = []
    # target id → index in `out`, so a model that emits the same item
    # twice produces one row instead of two competing edits.
    by_target: dict[str, int] = {}
    by_identity: dict[tuple[str, str], int] = {}

    for position, raw in enumerate(extraction.line_items, start=1):
        room = _clean_text(raw.room) or ""
        description = _clean_text(raw.description) or ""
        row = f"Row {position}"
        if description:
            row = (
                f"Row {position} ({room + ' — ' if room else ''}{description})"
            )

        action = (raw.action or "add").strip().lower()
        if action not in VALID_ACTIONS:
            warnings.append(
                f"{row}: unknown action {action!r} treated as 'add'."
            )
            action = "add"

        target = None
        if action in ("update", "remove"):
            target = _resolve_target(raw, scope, existing, row, warnings)
            if target is None:
                if action == "remove":
                    notes.append(
                        f'Client asked to drop "{description or room}" but '
                        "no matching item was found on the quotation — "
                        "check manually."
                    )
                    warnings.append(
                        f"{row}: removal dropped, no matching quotation item."
                    )
                    continue
                warnings.append(
                    f"{row}: no existing item matched, so this update is "
                    "recorded as new work."
                )
                action = "add"

        target_id = _target_id(target) if target is not None else None
        live = by_id.get(target_id) if target_id else None

        # An anchored edit adopts the quotation's own identity: the row
        # the human sees is the row that will change. A materially
        # different description is kept (the client renamed the work)
        # but only when it still describes the same thing.
        if target is not None:
            target_room = getattr(target, "room", room)
            target_desc = getattr(target, "description", description)
            room = target_room
            if description and description != target_desc:
                similarity = description_similarity(target_desc, description)
                if similarity < DESCRIPTION_MATCH_THRESHOLD:
                    warnings.append(
                        f'{row}: agent described this as "{description}"; '
                        f'kept the quotation\'s "{target_desc}".'
                    )
                    description = target_desc
                elif len(description) <= len(target_desc):
                    description = target_desc
            else:
                description = target_desc
        else:
            room = canonical_room(room, scope.known_rooms)

        if not description:
            warnings.append(f"{row}: dropped, no work description.")
            continue
        if not room:
            warnings.append(
                f"{row}: dropped, no room and none could be inferred."
            )
            continue

        stated_unit = _clean_text(raw.unit)
        stated_unit = normalize_unit(stated_unit) if stated_unit else None
        unit = stated_unit
        if unit is None and live is not None:
            # Inherited, not restated — see the no-op check below.
            unit = normalize_unit(live.unit) if live.unit else None
        elif unit is None:
            unit = "sqft"

        raw_dimension = _clean_text(raw.raw_dimension)
        if raw_dimension and parse_dimension(raw_dimension) is None:
            warnings.append(
                f'{row}: dimension "{raw_dimension}" could not be parsed '
                "— the item will be flagged for clarification."
            )

        item = NormalizedItem(
            action=action,
            target_item_id=target_id,
            room=room,
            description=description,
            unit=unit,
            raw_dimension=raw_dimension,
            qty=_clean_number(raw.qty, "qty", row, warnings),
            rate=_clean_number(raw.rate, "rate", row, warnings),
            est_time=_clean_text(raw.est_time),
            remarks=_clean_text(raw.remarks),
        )

        # A unit inherited from the target is not something the client
        # changed, so it cannot on its own justify keeping the row.
        stated = NormalizedItem(**{**vars(item), "unit": stated_unit})
        if action == "update" and not _has_payload(stated):
            warnings.append(
                f"{row}: update restated the item without changing "
                "anything — dropped."
            )
            continue

        merged_into = (
            by_target.get(target_id)
            if target_id
            else by_identity.get(_identity(item))
        )
        if merged_into is not None:
            # Absorb only what was stated: a defaulted unit must not
            # overwrite an explicit one on the earlier row.
            _absorb(out[merged_into], stated)
            warnings.append(
                f"{row}: merged into an earlier row for the same item."
            )
            continue

        out.append(item)
        if target_id:
            by_target[target_id] = len(out) - 1
        else:
            by_identity[_identity(item)] = len(out) - 1

    return NormalizedExtraction(
        meeting_minutes=[
            m
            for m in (_clean_text(x) for x in extraction.meeting_minutes)
            if m
        ],
        line_items=out,
        client_budget=_clean_number(
            extraction.client_budget, "client budget", "Budget", warnings
        ),
        unmapped_notes=notes,
        warnings=warnings,
    )


_PAYLOAD_FIELDS = (
    "unit",
    "raw_dimension",
    "qty",
    "rate",
    "est_time",
    "remarks",
)


def _has_payload(item: NormalizedItem) -> bool:
    """Whether an update actually carries a change."""
    return any(getattr(item, f) is not None for f in _PAYLOAD_FIELDS)


def _identity(item: NormalizedItem) -> tuple[str, str]:
    return (item.room.strip().lower(), item.description.strip().lower())


def _absorb(target: NormalizedItem, extra: NormalizedItem) -> None:
    """Fold a duplicate row into the one already kept; later wins."""
    for name in _PAYLOAD_FIELDS:
        value = getattr(extra, name)
        if value is not None:
            setattr(target, name, value)
    if extra.action == "remove":
        target.action = "remove"
