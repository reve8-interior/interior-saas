"""
Match room names from any source to the rooms a quotation already has.

A plan says "Master Bed Room" and "Bedroom 1"; the quotation says "Master
Bedroom", "Guest Bedroom" and "Kids Bedroom". Exact and near-exact names
are matched automatically. A generic plan label ("Bedroom 1") is only
*suggested* an unclaimed existing room of the same type, for the designer
to confirm. A specific name with no match stays a new room.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Literal, Sequence

from ..schemas.floorplan import FloorPlanRoomOut

NEAR_MATCH_RATIO = 0.85

MatchStatus = Literal["existing", "suggested", "new"]

# First keyword hit decides a room's type.
_TYPES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("bedroom", ("bedroom", "bed room", "bed")),
    ("kitchen", ("kitchen",)),
    ("living", ("living", "hall", "lounge")),
    ("dining", ("dining",)),
    ("pooja", ("pooja", "puja", "prayer")),
    ("bath", ("bath", "toilet", "wc", "washroom")),
)
_TYPE_WORDS = sorted(
    {w for _, words in _TYPES for w in words} | {"room"},
    key=len,
    reverse=True,
)


def _compact(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def room_type(name: str) -> str | None:
    lowered = name.lower()
    return next(
        (t for t, words in _TYPES if any(w in lowered for w in words)), None
    )


def _is_generic(name: str) -> bool:
    """True for labels like 'Bedroom', 'Bedroom 1', 'Bed Room 2'."""
    rest = name.lower()
    for word in _TYPE_WORDS:
        rest = rest.replace(word, " ")
    return re.sub(r"[\W_0-9]", "", rest) in ("", "a", "b", "c")


def _close_match(
    name: str, existing: Sequence[str], claimed: set[str]
) -> str | None:
    """An unclaimed existing room whose name is the same or nearly so."""
    target = _compact(name)
    return next(
        (
            e
            for e in existing
            if e not in claimed
            and (
                _compact(e) == target
                or SequenceMatcher(None, _compact(e), target).ratio()
                >= NEAR_MATCH_RATIO
            )
        ),
        None,
    )


def _generic_suggestion(
    name: str, existing: Sequence[str], claimed: set[str]
) -> str | None:
    """For a generic label ("Bedroom 1"), an unclaimed room of that type."""
    kind = room_type(name)
    if kind is None or not _is_generic(name):
        return None
    return next(
        (e for e in existing if e not in claimed and room_type(e) == kind),
        None,
    )


def match_name(name: str, existing: Sequence[str]) -> tuple[str, MatchStatus]:
    """One room name against the quotation's rooms: (room to use, status)."""
    hit = _close_match(name, existing, set())
    if hit is not None:
        return hit, "existing"
    suggestion = _generic_suggestion(name, existing, set())
    if suggestion is not None:
        return suggestion, "suggested"
    return name, "new"


def match_rooms(
    rooms: Sequence[FloorPlanRoomOut], existing: Sequence[str]
) -> list[FloorPlanRoomOut]:
    """Return the rooms with name, match_status and plan_label filled in.

    Rooms claim existing names one-to-one, exact matches first, so two
    plan rooms never land on the same quotation room.
    """
    claimed: set[str] = set()
    result = [r.model_copy() for r in rooms]
    pending: list[int] = []

    for i, room in enumerate(result):
        hit = _close_match(room.name, existing, claimed)
        if hit is None:
            pending.append(i)
            continue
        claimed.add(hit)
        room.plan_label, room.name = room.name, hit
        room.match_status = "existing"

    for i in pending:
        room = result[i]
        candidate = _generic_suggestion(room.name, existing, claimed)
        if candidate is None:
            continue
        claimed.add(candidate)
        room.plan_label, room.name = room.name, candidate
        room.match_status = "suggested"
    return result
