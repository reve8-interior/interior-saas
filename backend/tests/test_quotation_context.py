"""Unit tests for input-scoped quotation context selection.

Room names here are taken verbatim from a real 73-item quotation
("Kids bed room", "Pooja unit", "Crockery with wash basin") because the
whole point of the module is coping with house naming rather than the
tidy title-case an LLM would produce.
"""

from dataclasses import dataclass

from backend.services.quotation_context import (
    build_scope_context,
    canonical_room,
    render_scope_context,
    tokenize,
)


@dataclass
class Item:
    id: str
    room: str
    description: str
    unit: str = "sqft"
    raw_dimension: str | None = None
    qty: float | None = None
    rate: float | None = None
    status: str = "priced"


def _quotation() -> list[Item]:
    rows = [
        ("Living Room", "TV Unit Back Panel", 106, 450),
        ("Living Room", "Sofa back panel", 123, 350),
        ("Living Room", "Drawer", 4, 9500),
        ("Kitchen", "L shape base unit carcuss", 32, 1850),
        ("Kitchen", "counter top and backsplash", 5, 9500),
        ("Guest bed room", "Wardrobe", 125, 1350),
        ("Guest bed room", "Bed back side panel", 103, 350),
        ("Kids bed room", "Wardrobe", 55, 1350),
        ("Kids bed room", "loft", 18, 1050),
        ("Kids bed room", "Bay window storage unit", 25, 950),
        ("Master bed room", "wardrobe", 95, 1350),
        ("Master bed room", "bay window", 30, 1350),
        ("Pooja unit", "Storage", 15, 1350),
        ("Pooja unit", "Door", 95, 1500),
        ("Balcony", "Deck flooring", 68, 350),
        ("Crockery with wash basin", "Base unit", 20, 1350),
        ("Utility", "base unit", 25, 1250),
        ("Ceiling", "Total", 2025, 80),
        ("Furniture", "L shape sofa", None, 105000),
    ]
    return [
        Item(id=f"id-{i}", room=room, description=desc, qty=qty, rate=rate)
        for i, (room, desc, qty, rate) in enumerate(rows)
    ]


# ── Room matching ────────────────────────────────────────────────────────────


def test_informal_room_name_matches_house_naming():
    """ "kids room" must find "Kids bed room" — the token "kids" is unique."""
    ctx = build_scope_context(
        "Client wants a red and gray floor colour in kids room.", _quotation()
    )
    assert ctx.matched_rooms == ["Kids bed room"]
    assert {i.description for i in ctx.items} == {
        "Wardrobe",
        "loft",
        "Bay window storage unit",
    }


def test_shared_word_room_does_not_match_everything():
    """ "room" alone appears in four room names, so it anchors nothing."""
    ctx = build_scope_context(
        "We talked about the room in general.", _quotation()
    )
    assert ctx.matched_rooms == []
    assert ctx.items == []


def test_only_the_named_room_is_sent():
    ctx = build_scope_context(
        "in pooja unit, i want small wooden mandir", _quotation()
    )
    assert ctx.matched_rooms == ["Pooja unit"]
    assert {i.room for i in ctx.items} == {"Pooja unit"}
    # The other 17 items stay out of the prompt entirely.
    assert ctx.omitted_items == len(_quotation()) - 2


def test_multi_word_room_matches_on_a_distinctive_token():
    ctx = build_scope_context(
        "add a mirror to the crockery area", _quotation()
    )
    assert "Crockery with wash basin" in ctx.matched_rooms


def test_two_rooms_can_match_at_once():
    ctx = build_scope_context(
        "Increase the kitchen counter and the balcony deck.", _quotation()
    )
    assert set(ctx.matched_rooms) == {"Kitchen", "Balcony"}


# ── Item-level lexical matching ──────────────────────────────────────────────


def test_item_matches_without_its_room_being_named():
    """ "sofa back panel" resolves even though the client never says room."""
    ctx = build_scope_context("make the sofa back panel taller", _quotation())
    assert ctx.matched_rooms == []
    descriptions = [i.description for i in ctx.items]
    assert "Sofa back panel" in descriptions


def test_lexical_hits_are_tagged_and_ranked_after_room_hits():
    ctx = build_scope_context(
        "in kids bed room raise the loft; also the L shape sofa", _quotation()
    )
    reasons = {i.description: i.reason for i in ctx.items}
    assert reasons["loft"] == "room"
    assert reasons["L shape sofa"] == "lexical"
    room_positions = [n for n, i in enumerate(ctx.items) if i.reason == "room"]
    lex_positions = [
        n for n, i in enumerate(ctx.items) if i.reason == "lexical"
    ]
    assert max(room_positions) < min(lex_positions)


# ── Determinism, refs and capping ────────────────────────────────────────────


def test_selection_is_deterministic():
    text = "kids bed room wardrobe should be 6 feet"
    first = build_scope_context(text, _quotation())
    second = build_scope_context(text, _quotation())
    assert [i.ref for i in first.items] == [i.ref for i in second.items]
    assert [i.item_id for i in first.items] == [
        i.item_id for i in second.items
    ]


def test_refs_are_sequential_and_map_back_to_ids():
    ctx = build_scope_context("kids bed room changes", _quotation())
    assert [i.ref for i in ctx.items] == ["E1", "E2", "E3"]
    assert ctx.by_ref["E1"].item_id == ctx.items[0].item_id


def test_max_items_caps_the_prompt_and_reports_the_remainder():
    ctx = build_scope_context(
        "kids bed room changes", _quotation(), max_items=2
    )
    assert len(ctx.items) == 2
    assert ctx.omitted_items == len(_quotation()) - 2


def test_empty_quotation_yields_no_preamble():
    ctx = build_scope_context("brand new client", [])
    assert ctx.total_items == 0
    assert render_scope_context(ctx) == ""


# ── Rendering ────────────────────────────────────────────────────────────────


def test_render_lists_rooms_refs_and_the_omitted_count():
    ctx = build_scope_context("in pooja unit, i want a mandir", _quotation())
    text = render_scope_context(ctx)
    assert "Pooja unit" in text
    assert "Crockery with wash basin" in text  # roster names every room
    assert "E1 | Pooja unit | Storage" in text
    # An unrelated item's description must not reach the prompt.
    assert "Deck flooring" not in text
    assert f"{ctx.omitted_items} further items" in text
    assert text.endswith("--- TRANSCRIPT ---\n")


def test_render_says_so_when_nothing_matched():
    ctx = build_scope_context(
        "Client will email photos next week.", _quotation()
    )
    text = render_scope_context(ctx)
    assert "none are listed" in text
    assert "Living Room" in text  # roster is always offered


# ── Room canonicalisation ────────────────────────────────────────────────────


def test_canonical_room_snaps_model_casing_onto_house_naming():
    rooms = [i.room for i in _quotation()]
    assert canonical_room("Kids Bedroom", rooms) == "Kids bed room"
    assert canonical_room("kids bed room", rooms) == "Kids bed room"
    assert canonical_room("Pooja Unit", rooms) == "Pooja unit"
    assert canonical_room("LIVING ROOM", rooms) == "Living Room"


def test_canonical_room_keeps_genuinely_new_rooms():
    rooms = [i.room for i in _quotation()]
    assert canonical_room("Home Theatre", rooms) == "Home Theatre"


def test_canonical_room_refuses_to_guess_between_candidates():
    """ "bed room" fits three rooms, so it must not be snapped to one."""
    rooms = [i.room for i in _quotation()]
    assert canonical_room("bed room", rooms) == "bed room"


def test_tokenize_is_symmetric_on_plurals():
    assert tokenize("Lights") == tokenize("light")
