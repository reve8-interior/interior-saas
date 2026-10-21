"""Unit tests for deterministic normalisation of an agent extraction.

These pin the guarantees the pipeline makes regardless of how the model
behaves on any given call: an update either anchors on a real line item
or is demoted, room names never fork, and nothing scope-relevant is
dropped without saying so.
"""

from dataclasses import dataclass, field

from backend.services.extraction_postprocess import normalize_extraction
from backend.services.quotation_context import build_scope_context


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


@dataclass
class RawItem:
    room: str
    description: str
    action: str = "add"
    target_ref: str | None = None
    unit: str | None = None
    raw_dimension: str | None = None
    qty: float | None = None
    rate: float | None = None
    est_time: str | None = None
    remarks: str | None = None


@dataclass
class RawExtraction:
    line_items: list[RawItem] = field(default_factory=list)
    meeting_minutes: list[str] = field(default_factory=list)
    client_budget: float | None = None
    unmapped_notes: list[str] = field(default_factory=list)


QUOTATION = [
    Item("id-1", "Kids bed room", "Wardrobe", qty=55, rate=1350),
    Item("id-2", "Kids bed room", "loft", qty=18, rate=1050),
    Item("id-3", "Kids bed room", "Bay window storage unit", qty=25, rate=950),
    Item("id-4", "Master bed room", "wardrobe", qty=95, rate=1350),
    Item("id-5", "Pooja unit", "Storage", qty=15, rate=1350),
    Item("id-6", "Living Room", "Sofa back panel", qty=123, rate=350),
]


def _run(transcript: str, items: list[RawItem], **kwargs):
    scope = build_scope_context(transcript, QUOTATION)
    extraction = RawExtraction(line_items=items, **kwargs)
    return normalize_extraction(extraction, scope, QUOTATION)


# ── Ref anchoring ────────────────────────────────────────────────────────────


def test_ref_resolves_to_the_real_line_item_id():
    transcript = "make the kids bed room wardrobe 6x8 instead"
    scope = build_scope_context(transcript, QUOTATION)
    ref = next(i.ref for i in scope.items if i.description == "Wardrobe")

    result = normalize_extraction(
        RawExtraction(
            line_items=[
                RawItem(
                    room="Kids bed room",
                    description="Wardrobe",
                    action="update",
                    target_ref=ref,
                    raw_dimension="6x8",
                )
            ]
        ),
        scope,
        QUOTATION,
    )
    (item,) = result.line_items
    assert item.action == "update"
    assert item.target_item_id == "id-1"
    assert item.raw_dimension == "6x8"
    # Unstated fields stay null: a meeting is a delta, not a restatement.
    assert item.rate is None and item.qty is None


def test_hallucinated_ref_falls_back_to_a_description_match():
    result = _run(
        "raise the rate on the kids bed room loft to 1200",
        [
            RawItem(
                room="Kids bed room",
                description="loft",
                action="update",
                target_ref="E99",
                rate=1200,
            )
        ],
    )
    (item,) = result.line_items
    assert item.target_item_id == "id-2"
    assert item.rate == 1200
    assert any("E99" in w for w in result.warnings)


def test_update_with_no_identifiable_target_is_demoted_to_add():
    result = _run(
        "add a study table in the kids bed room",
        [
            RawItem(
                room="Kids bed room",
                description="Study table with drawers",
                action="update",
                target_ref=None,
                rate=8000,
            )
        ],
    )
    (item,) = result.line_items
    assert item.action == "add"
    assert item.target_item_id is None
    assert any("recorded as new work" in w for w in result.warnings)


def test_unanchored_update_still_matches_by_room_and_description():
    result = _run(
        "the pooja unit storage rate is now 1500",
        [
            RawItem(
                room="Pooja Unit",
                description="Storage",
                action="update",
                rate=1500,
            )
        ],
    )
    (item,) = result.line_items
    assert item.target_item_id == "id-5"
    assert item.room == "Pooja unit"


# ── Removals ─────────────────────────────────────────────────────────────────


def test_removal_anchors_on_the_existing_item():
    transcript = "drop the bay window storage unit in kids bed room"
    scope = build_scope_context(transcript, QUOTATION)
    ref = next(
        i.ref
        for i in scope.items
        if i.description == "Bay window storage unit"
    )
    result = normalize_extraction(
        RawExtraction(
            line_items=[
                RawItem(
                    room="Kids bed room",
                    description="Bay window storage unit",
                    action="remove",
                    target_ref=ref,
                )
            ]
        ),
        scope,
        QUOTATION,
    )
    (item,) = result.line_items
    assert item.action == "remove"
    assert item.target_item_id == "id-3"


def test_unmatched_removal_never_creates_a_row():
    """A removal that matches nothing must not become new work."""
    result = _run(
        "cancel the jacuzzi",
        [RawItem(room="Bathroom", description="Jacuzzi", action="remove")],
    )
    assert result.line_items == []
    assert any("Jacuzzi" in n for n in result.unmapped_notes)


# ── Room and unit canonicalisation ───────────────────────────────────────────


def test_model_room_casing_snaps_onto_the_quotation():
    result = _run(
        "new tall unit in the kids bedroom",
        [RawItem(room="Kids Bedroom", description="Tall unit", unit="Sqft")],
    )
    (item,) = result.line_items
    assert item.room == "Kids bed room"
    assert item.unit == "sqft"


def test_new_room_is_left_alone():
    result = _run(
        "we want a home theatre now",
        [RawItem(room="Home Theatre", description="Acoustic panelling")],
    )
    assert result.line_items[0].room == "Home Theatre"


def test_update_inherits_the_unit_it_did_not_restate():
    result = _run(
        "kids bed room loft qty goes to 22",
        [
            RawItem(
                room="Kids bed room",
                description="loft",
                action="update",
                qty=22,
            )
        ],
    )
    (item,) = result.line_items
    assert item.unit == "sqft"
    assert item.qty == 22


def test_unit_defaults_to_sqft_when_none_is_stated():
    result = _run(
        "client wants some artwork in the living room",
        [RawItem(room="Living Room", description="Artwork")],
    )
    assert result.line_items[0].unit == "sqft"


def test_agent_rename_that_drifts_too_far_keeps_the_quotation_wording():
    result = _run(
        "the pooja unit storage costs 1500 now",
        [
            RawItem(
                room="Pooja unit",
                description="Prayer cabinet shelving",
                action="update",
                target_ref="E1",
                rate=1500,
            )
        ],
    )
    (item,) = result.line_items
    assert item.description == "Storage"
    assert any("Prayer cabinet shelving" in w for w in result.warnings)


# ── Value hygiene ────────────────────────────────────────────────────────────


def test_unparseable_dimension_is_flagged_not_dropped():
    result = _run(
        "living room console about 6 feet wide",
        [
            RawItem(
                room="Living Room",
                description="Console",
                raw_dimension="about 6 feet",
            )
        ],
    )
    assert result.line_items[0].raw_dimension == "about 6 feet"
    assert any("could not be parsed" in w for w in result.warnings)


def test_negative_numbers_are_rejected():
    result = _run(
        "living room console",
        [RawItem(room="Living Room", description="Console", rate=-500)],
    )
    assert result.line_items[0].rate is None
    assert any("negative rate" in w for w in result.warnings)


def test_rows_without_a_description_are_dropped():
    result = _run(
        "something in the kitchen",
        [RawItem(room="Kitchen", description="   ")],
    )
    assert result.line_items == []
    assert any("no work description" in w for w in result.warnings)


def test_unknown_action_defaults_to_add():
    result = _run(
        "new item",
        [RawItem(room="Living Room", description="Rug", action="modify")],
    )
    assert result.line_items[0].action == "add"


# ── De-duplication and no-ops ────────────────────────────────────────────────


def test_two_rows_targeting_one_item_collapse_into_one():
    result = _run(
        "kids bed room wardrobe: 6x8, and make the rate 1400",
        [
            RawItem(
                room="Kids bed room",
                description="Wardrobe",
                action="update",
                target_ref="E1",
                raw_dimension="6x8",
            ),
            RawItem(
                room="Kids bed room",
                description="Wardrobe",
                action="update",
                target_ref="E1",
                rate=1400,
            ),
        ],
    )
    (item,) = result.line_items
    assert item.raw_dimension == "6x8"
    assert item.rate == 1400
    assert any("merged into an earlier row" in w for w in result.warnings)


def test_duplicate_new_items_collapse_by_room_and_description():
    result = _run(
        "two mentions of the same new work",
        [
            RawItem(room="Living Room", description="Rug", unit="nos"),
            RawItem(room="living room", description="rug", qty=1),
        ],
    )
    assert len(result.line_items) == 1
    assert result.line_items[0].unit == "nos"
    assert result.line_items[0].qty == 1


def test_update_that_changes_nothing_is_dropped():
    """The classic failure: the model echoes a row back unchanged."""
    result = _run(
        "we reviewed the kids bed room wardrobe",
        [
            RawItem(
                room="Kids bed room",
                description="Wardrobe",
                action="update",
                target_ref="E1",
            )
        ],
    )
    assert result.line_items == []
    assert any("without changing anything" in w for w in result.warnings)


def test_remark_only_update_survives():
    """A finish or colour change is a real update with no numbers."""
    result = _run(
        "red and gray combination for the kids bed room wardrobe shutters",
        [
            RawItem(
                room="Kids bed room",
                description="Wardrobe",
                action="update",
                target_ref="E1",
                remarks="Shutters in a red and gray combination.",
            )
        ],
    )
    (item,) = result.line_items
    assert item.action == "update"
    assert item.target_item_id == "id-1"
    assert item.qty is None and item.rate is None


# ── Nothing scope-relevant disappears ────────────────────────────────────────


def test_unmapped_notes_are_preserved():
    """The bug that started this: a statement with no line item vanished."""
    result = _run(
        "Client wants a red and gray combination for the floor in kids room.",
        [],
        unmapped_notes=[
            "Client asked for a red and gray floor colour in the kids "
            "bedroom; no flooring item exists yet."
        ],
    )
    assert result.line_items == []
    assert len(result.unmapped_notes) == 1
    assert "red and gray" in result.unmapped_notes[0]


def test_minutes_and_budget_are_cleaned():
    result = _run(
        "budget talk",
        [],
        meeting_minutes=["  Budget   confirmed  ", "", "   "],
        client_budget=1200000.0,
    )
    assert result.meeting_minutes == ["Budget confirmed"]
    assert result.client_budget == 1200000.0
