"""
Input-scoped quotation context for the extraction agent.

A mature quotation runs to 70+ line items. Feeding all of them to the
model on every checkpoint buries the two or three rows the client
actually talked about, invites cross-room confusion, and costs tokens
that grow with the project. This module picks the relevant slice from
the transcript alone — no LLM, no embeddings — so the same transcript
always yields the same context and the selection is unit-testable.

Selection runs in two passes over the quotation's own vocabulary:

  1. Rooms the transcript names contribute every item in that room.
     Matching goes through a *rare token* index built from the room
     names themselves, so "kids room" finds "Kids bed room" while the
     shared word "room" matches nothing on its own.
  2. Items whose description overlaps the transcript are pulled in from
     any room, so "make the sofa back panel taller" resolves without
     the client naming the room.

Every included item is given a short ref (E1, E2 …). The agent echoes
that ref back in `target_ref`, and services.extraction_postprocess maps
it to the real line-item id — which is what turns "the client changed
this item" into an exact anchor instead of a fuzzy description match.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Protocol

# Only true function words. Everything else earns or loses its
# discriminating power through the rare-token index below, which adapts
# to whatever vocabulary a given quotation happens to use.
_STOPWORDS = frozenset(
    {
        "a", "an", "and", "the", "of", "for", "with", "in", "on", "at",
        "to", "is", "are", "be", "by", "or", "as", "we", "i", "you", "it",
        "that", "this", "please", "want", "need", "would", "like",
    }
)  # fmt: skip

_WORD_RE = re.compile(r"[a-z0-9]+")

# A token shared by at most this many room names / descriptions still
# counts as a usable anchor. 1 = the token names exactly one thing.
_RARE_MAX_DOCS = 1

# Fraction of an item's tokens that must appear in the transcript for a
# lexical (non-room) hit, when no rare token matched.
_LEXICAL_MATCH_RATIO = 0.6

# Upper bound on items rendered into the prompt. Room matches are kept
# ahead of lexical matches when trimming.
DEFAULT_MAX_ITEMS = 40


class ScopeItem(Protocol):
    """Shape of a quotation line item (ORM-agnostic, for testability)."""

    id: object
    room: str
    description: str
    unit: str
    raw_dimension: str | None
    qty: object
    rate: object
    status: object


@dataclass
class ContextItem:
    """One existing line item offered to the agent, with its ref handle."""

    ref: str
    item_id: str
    room: str
    description: str
    unit: str
    raw_dimension: str | None
    qty: float | None
    rate: float | None
    status: str
    # "room" (its room was named) or "lexical" (its description matched)
    reason: str


@dataclass
class ScopeContext:
    """The slice of an existing quotation relevant to one transcript."""

    items: list[ContextItem] = field(default_factory=list)
    matched_rooms: list[str] = field(default_factory=list)
    known_rooms: list[str] = field(default_factory=list)
    total_items: int = 0
    omitted_items: int = 0

    @property
    def by_ref(self) -> dict[str, ContextItem]:
        return {ci.ref: ci for ci in self.items}


# ── Tokenisation ─────────────────────────────────────────────────────────────


def _singular(word: str) -> str:
    """Crude, symmetric de-pluralisation.

    Correctness as English matters far less than applying the identical
    transform to both sides of every comparison.
    """
    if len(word) > 3 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 3 and word.endswith("es") and not word.endswith("ses"):
        return word[:-2]
    if len(word) > 3 and word.endswith("s"):
        return word[:-1]
    return word


def tokenize(text: str) -> set[str]:
    """Normalised, de-pluralised content tokens of a string."""
    return {
        _singular(w)
        for w in _WORD_RE.findall((text or "").lower())
        if w not in _STOPWORDS
    }


def _despace(text: str) -> str:
    """Letters and digits only, so "bed room" and "bedroom" compare equal."""
    return "".join(_WORD_RE.findall((text or "").lower()))


def _rare_tokens(docs: list[set[str]]) -> set[str]:
    """Tokens that occur in at most _RARE_MAX_DOCS of the given docs."""
    counts: dict[str, int] = {}
    for doc in docs:
        for token in doc:
            counts[token] = counts.get(token, 0) + 1
    return {t for t, n in counts.items() if n <= _RARE_MAX_DOCS}


# ── Selection ────────────────────────────────────────────────────────────────


def _match_rooms(
    transcript: set[str], rooms: list[str], despaced_transcript: str = ""
) -> list[str]:
    """Room names the transcript plausibly refers to.

    A room matches when the transcript contains a token unique to that
    room across the roster ("kids", "pooja"), or contains every token of
    the room name. The shared words that make Indian room names collide
    — "room", "bed", "unit" — are never anchors on their own because the
    rare-token index sees them in several rooms at once.
    """
    room_tokens = [tokenize(r) for r in rooms]
    rare = _rare_tokens(room_tokens)
    matched: list[str] = []
    for room, tokens in zip(rooms, room_tokens):
        if not tokens:
            continue
        distinctive = tokens & rare
        if distinctive & transcript:
            matched.append(room)
        elif tokens <= transcript:
            matched.append(room)
        elif _despace(room) and _despace(room) in despaced_transcript:
            # Catches "kids bedroom" for a quotation that writes
            # "Kids bed room", which no token comparison can see.
            matched.append(room)
    return matched


def _lexical_hits(
    transcript: set[str],
    items: list[ScopeItem],
    rare_desc_tokens: set[str],
) -> dict[int, float]:
    """Index → score for items whose description the transcript echoes."""
    hits: dict[int, float] = {}
    for idx, item in enumerate(items):
        tokens = tokenize(item.description)
        if not tokens:
            continue
        overlap = tokens & transcript
        if not overlap:
            continue
        if overlap & rare_desc_tokens:
            hits[idx] = 1.0 + len(overlap) / len(tokens)
        else:
            ratio = len(overlap) / len(tokens)
            if ratio >= _LEXICAL_MATCH_RATIO:
                hits[idx] = ratio
    return hits


def _to_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _status_str(value: object) -> str:
    return str(getattr(value, "value", value) or "draft")


def build_scope_context(
    transcript: str,
    items: list[ScopeItem],
    max_items: int = DEFAULT_MAX_ITEMS,
) -> ScopeContext:
    """Pick the part of an existing quotation this transcript is about."""
    known_rooms: list[str] = []
    for item in items:
        if item.room and item.room not in known_rooms:
            known_rooms.append(item.room)

    context = ScopeContext(known_rooms=known_rooms, total_items=len(items))
    if not items:
        return context

    transcript_tokens = tokenize(transcript)
    matched_rooms = _match_rooms(
        transcript_tokens, known_rooms, _despace(transcript)
    )
    context.matched_rooms = matched_rooms

    matched_room_set = set(matched_rooms)
    # Words the client spent naming a room are not evidence about item
    # descriptions: "kids bed room" must not drag in "Bed back side
    # panel" from a different bedroom on the strength of "bed".
    room_words: set[str] = set()
    for room in matched_rooms:
        room_words |= tokenize(room)
    rare_desc = _rare_tokens([tokenize(i.description) for i in items])
    lexical = _lexical_hits(transcript_tokens - room_words, items, rare_desc)

    # Room hits first (a named room is a stronger signal than a word
    # that happens to appear), then lexical hits by descending score.
    ordered: list[tuple[int, str]] = [
        (idx, "room")
        for idx, item in enumerate(items)
        if item.room in matched_room_set
    ]
    seen = {idx for idx, _ in ordered}
    ordered += [
        (idx, "lexical")
        for idx, _ in sorted(
            lexical.items(), key=lambda kv: kv[1], reverse=True
        )
        if idx not in seen
    ]

    for position, (idx, reason) in enumerate(ordered[:max_items], start=1):
        item = items[idx]
        context.items.append(
            ContextItem(
                ref=f"E{position}",
                item_id=str(item.id),
                room=item.room,
                description=item.description,
                unit=item.unit,
                raw_dimension=item.raw_dimension,
                qty=_to_float(item.qty),
                rate=_to_float(item.rate),
                status=_status_str(item.status),
                reason=reason,
            )
        )
    context.omitted_items = len(items) - len(context.items)
    return context


# ── Rendering ────────────────────────────────────────────────────────────────


def _num(value: float | None) -> str:
    if value is None:
        return "-"
    return str(int(value)) if value == int(value) else f"{value:g}"


def render_scope_context(context: ScopeContext) -> str:
    """Render a ScopeContext as the prompt preamble for the agent.

    Empty string when the client has no quotation yet — a first
    checkpoint should not be primed with an empty-scope preamble.
    """
    if context.total_items == 0:
        return ""

    roster = ", ".join(context.known_rooms) or "(none)"
    lines = [
        "CURRENT QUOTATION — what is already quoted for this client.",
        "",
        f"Rooms already on the quotation: {roster}",
        (
            "Use these room names verbatim when the client is talking "
            "about one of them."
        ),
        "",
    ]

    if not context.items:
        lines.append(
            "None of the "
            f"{context.total_items} existing items look related to this "
            "transcript, so none are listed. Treat the work discussed "
            "below as new unless it clearly names one of the rooms above."
        )
        return "\n".join(lines) + "\n\n--- TRANSCRIPT ---\n"

    lines.append(
        "EXISTING ITEMS THIS TRANSCRIPT MAY REFER TO. When the client "
        "changes or drops one of these, put its ref in target_ref and "
        "set action to update or remove — do not restate it as new work."
    )
    lines.append("")
    lines.append(
        "ref | room | description | unit | dimension | qty | rate | status"
    )
    for ci in context.items:
        lines.append(
            " | ".join(
                [
                    ci.ref,
                    ci.room,
                    ci.description,
                    ci.unit or "-",
                    ci.raw_dimension or "-",
                    _num(ci.qty),
                    _num(ci.rate),
                    ci.status,
                ]
            )
        )

    if context.omitted_items:
        lines.append("")
        lines.append(
            f"({context.omitted_items} further items on this quotation are "
            "not shown because the transcript does not appear to mention "
            "them. Never invent a ref that is not listed above.)"
        )

    return "\n".join(lines) + "\n\n--- TRANSCRIPT ---\n"


# ── Room canonicalisation ────────────────────────────────────────────────────


def canonical_room(name: str, known_rooms: list[str]) -> str:
    """Snap an extracted room name onto an existing one when they agree.

    Room naming is house style, not a model decision: a quotation that
    already says "Kids bed room" must not sprout a parallel "Kids
    Bedroom" because the model prefers title case. Exact-after-
    normalisation wins first, then a unique rare-token hit.
    """
    cleaned = (name or "").strip()
    if not cleaned or not known_rooms:
        return cleaned

    target = tokenize(cleaned)
    if not target:
        return cleaned

    room_tokens = [tokenize(r) for r in known_rooms]
    for room, tokens in zip(known_rooms, room_tokens):
        if tokens == target:
            return room

    # "Kids Bedroom" and "Kids bed room" are the same room written two
    # ways; only a whitespace-blind comparison sees that.
    target_despaced = _despace(cleaned)
    for room in known_rooms:
        if _despace(room) == target_despaced:
            return room

    rare = _rare_tokens(room_tokens)
    candidates = [
        room
        for room, tokens in zip(known_rooms, room_tokens)
        if (tokens & rare & target)
    ]
    if len(candidates) == 1:
        return candidates[0]
    return cleaned
