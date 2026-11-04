"""
The one gate every row passes before it reaches a quotation.

Notes, voice, text, floor plans, design hotspots and hand-typed rows all end
in a write to the quotation's line items. Each of those writes asks this
module the same question first, so the answer cannot differ by source:

  • is the row well-formed (room and description present, a known action)?
  • which room spelling does it use? An unambiguous match to a room the
    quotation already has uses the quotation's own spelling.
  • what does it do: add a line, update one, remove one, or nothing?

The answer is a pure function of the row and the quotation's lines: no LLM,
no clock, no database. Same input, same decision, every time.

Rules, in order:
  1. Blank room or description is rejected (422); an unknown action is read
     as "add". Whitespace is collapsed.
  2. A row anchored on a line (`target_item_id`) acts on exactly that line.
     If that line was removed, an update or remove does nothing (a removed
     line is never brought back by a later mention), and an add falls
     through to rule 3.
  3. Otherwise the row is matched to a live line in the same room by
     description. Removed lines are never candidates, and a line already
     claimed by an earlier row of the same batch is not matched again.
       add    + match    → update that line (a duplicate is never created)
       add    + no match → add
       update + match    → update; no match → add, unless it was anchored
                           on a line that is gone, then nothing
       remove + match    → remove; no match → nothing
  4. Callers that must not fold a duplicate silently (a hotspot, a hand-typed
     row) call `refuse_duplicate`, which turns "add that found a match" into
     a 409 unless the designer chose to add anyway.
"""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass
from typing import Literal

from ..models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from .room_matching import match_name
from .text_matching import find_matching_item

Action = Literal["add", "update", "remove"]
Outcome = Literal["add", "update", "remove", "skip"]
ACTIONS: tuple[Action, ...] = ("add", "update", "remove")


class IntakeRejected(Exception):
    """The row cannot enter the quotation; `status_code` suits a response."""

    def __init__(self, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class Decision:
    outcome: Outcome
    room: str  # the spelling to store
    description: str
    target: QuotationLineItem | None = None  # the line to update or remove
    # An "add" that matched an existing line, so became an update.
    duplicate_of: QuotationLineItem | None = None
    reason: str | None = None  # why a row did nothing


def tidy(text: str | None) -> str:
    """Trim and collapse runs of whitespace."""
    return " ".join((text or "").split())


def _live(
    items: Collection[QuotationLineItem], taken: Collection[int]
) -> list[QuotationLineItem]:
    return [
        i
        for i in items
        if i.status != QuotationItemStatus.removed and id(i) not in taken
    ]


def decide(
    room: str | None,
    description: str | None,
    items: Collection[QuotationLineItem],
    *,
    action: str | None = "add",
    target_item_id: str | None = None,
    taken: Collection[int] = (),
) -> Decision:
    """What one incoming row does to the quotation. See the module rules.

    `taken` holds `id()` of lines an earlier row of the same batch already
    changed; they are not matched again by description.
    """
    room = tidy(room)
    description = tidy(description)
    if not room:
        raise IntakeRejected("A room is required")
    if not description:
        raise IntakeRejected("A description is required")

    wanted = (action or "add").strip().lower()
    verb: Action = wanted if wanted in ACTIONS else "add"  # type: ignore[assignment]

    live = _live(items, ())
    snapped, status = match_name(
        room, list(dict.fromkeys(i.room for i in live))
    )
    if status == "existing":
        room = snapped

    anchor = str(target_item_id).strip() if target_item_id else ""
    anchored = None
    if anchor:
        anchored = next((i for i in items if str(i.id) == anchor), None)
    if anchored is not None:
        if anchored.status != QuotationItemStatus.removed:
            outcome: Outcome = "remove" if verb == "remove" else "update"
            return Decision(outcome, anchored.room, description, anchored)
        if verb != "add":
            return Decision(
                "skip",
                room,
                description,
                reason="That line was already removed",
            )

    match = find_matching_item(room, description, _live(items, taken))
    if verb == "remove":
        if match is None:
            return Decision(
                "skip",
                room,
                description,
                reason="No matching line to remove",
            )
        return Decision("remove", match.room, description, match)
    if match is not None:
        return Decision(
            "update",
            match.room,
            description,
            match,
            duplicate_of=match if verb == "add" else None,
        )
    if verb == "update" and anchor:
        return Decision(
            "skip",
            room,
            description,
            reason="The line to update is no longer in the quotation",
        )
    return Decision("add", room, description)


def refuse_duplicate(decision: Decision, allow_duplicate: bool) -> None:
    """For callers that add a single row: stop an unconfirmed duplicate."""
    found = decision.duplicate_of
    if found is None or allow_duplicate:
        return
    raise IntakeRejected(
        f"Looks like “{found.description}” is already in {found.room}. "
        "Add it anyway, or edit that line.",
        409,
    )
