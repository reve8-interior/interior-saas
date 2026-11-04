"""
Shared checks for a row about to enter a quotation, whatever its source.

A design hotspot, a floor plan, notes or a manual add all describe work as
a room plus a description. Before the row is added, this answers two
questions the same way for every source:

  • which of the quotation's rooms does it belong to?
  • is a similar item already there?

Both are suggestions for the designer: nothing is merged or renamed except
a room that is an unambiguous match to an existing one.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from ..models.material import MaterialRate
from ..models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from .room_matching import MatchStatus, match_name
from .text_matching import (
    DESCRIPTION_MATCH_THRESHOLD,
    description_similarity,
    find_matching_item,
    normalize_text,
)


@dataclass(frozen=True)
class IntakeCheck:
    room: str  # the room to use: the quotation's own when it matched
    room_status: MatchStatus
    similar: QuotationLineItem | None


def live_items(items: Sequence[QuotationLineItem]) -> list[QuotationLineItem]:
    return [i for i in items if i.status != QuotationItemStatus.removed]


def find_similar(
    room: str, description: str, items: Sequence[QuotationLineItem]
) -> QuotationLineItem | None:
    """The most similar live item in `room` (room names compared normalised)."""
    return find_matching_item(room, description, live_items(items))


def find_material(
    description: str, materials: Sequence[MaterialRate]
) -> MaterialRate | None:
    """The catalogue material a description most plausibly names.

    A material counts when its name is spelled out in the description (a
    "Marine ply wardrobe" names "Marine ply") or the two read alike; of
    several, the longest name wins as the most specific. A suggestion only:
    the designer decides whether to use its unit and rate.
    """
    text = normalize_text(description)
    best: MaterialRate | None = None
    best_score = 0.0
    for material in materials:
        name = normalize_text(material.name)
        if len(name) < 3:
            continue
        if f" {name} " in f" {text} ":
            score = 1.0 + len(name) / 1000  # longer, more specific name wins
        else:
            score = description_similarity(material.name, description)
            if score < DESCRIPTION_MATCH_THRESHOLD:
                continue
        if score > best_score:
            best, best_score = material, score
    return best


def check_row(
    room: str, description: str, items: Sequence[QuotationLineItem]
) -> IntakeCheck:
    """Room match and likely duplicate for one incoming row."""
    existing = list(dict.fromkeys(i.room for i in live_items(items)))
    matched, status = match_name(room.strip(), existing)
    # A suggestion is only a suggestion: look for duplicates in the room the
    # designer actually named, unless it was an unambiguous match.
    target = matched if status == "existing" else room.strip()
    return IntakeCheck(
        room=matched,
        room_status=status,
        similar=find_similar(target, description, items),
    )
