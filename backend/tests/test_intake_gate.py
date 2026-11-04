"""The intake gate: one deterministic decision for every source.

Pure unit tests (no DB): each rule in `services/intake_gate.py` and each
edge case around it, then the same rules as seen through the checkpoint
merge, which is how notes, voice, text and floor plans reach a quotation.
"""

import uuid

import pytest

from backend.models.quotation_line_item import QuotationItemStatus
from backend.services.checkpoint_merge import merge_checkpoint_items
from backend.services.intake_gate import (
    IntakeRejected,
    decide,
    refuse_duplicate,
    tidy,
)

from .test_checkpoint_merge import (
    Anchored,
    FakeSession,
    Incoming,
    _item,
    _quotation,
)

REMOVED = QuotationItemStatus.removed


def line(room="Living Room", description="Sofa", **kw):
    return _item(room=room, description=description, **kw)


# -- well-formedness ---------------------------------------------------------


@pytest.mark.parametrize("room", ["", "   ", None, "\t\n"])
def test_blank_room_is_rejected(room):
    with pytest.raises(IntakeRejected) as err:
        decide(room, "Sofa", [])
    assert err.value.status_code == 422


@pytest.mark.parametrize("description", ["", "   ", None])
def test_blank_description_is_rejected(description):
    with pytest.raises(IntakeRejected):
        decide("Hall", description, [])


def test_whitespace_is_collapsed_in_what_is_stored():
    d = decide("  Living   Room ", "  Corner   sofa\t", [])
    assert (d.room, d.description) == ("Living Room", "Corner sofa")


def test_tidy_handles_none():
    assert tidy(None) == ""


@pytest.mark.parametrize("action", [None, "", "ADD", " add ", "delete", "x"])
def test_unknown_or_missing_action_is_an_add(action):
    assert decide("Hall", "Mandir", [], action=action).outcome == "add"


def test_action_is_case_and_space_insensitive():
    sofa = line()
    d = decide("Living Room", "Sofa", [sofa], action=" REMOVE ")
    assert d.outcome == "remove" and d.target is sofa


# -- rooms -------------------------------------------------------------------


def test_near_identical_room_uses_the_quotations_spelling():
    d = decide("living room", "Lamp", [line(room="Living Room")])
    assert d.room == "Living Room" and d.outcome == "add"


def test_extra_spaces_and_punctuation_still_snap_to_the_existing_room():
    d = decide("Living  Room.", "Lamp", [line(room="Living Room")])
    assert d.room == "Living Room"


def test_a_new_room_stays_as_typed():
    d = decide("Study", "Desk", [line(room="Living Room")])
    assert (d.room, d.outcome) == ("Study", "add")


def test_a_generic_label_is_not_silently_renamed():
    # "Bedroom 1" might be Master or Kids; the gate never guesses.
    items = [line(room="Master Bedroom"), line(room="Kids Bedroom")]
    assert decide("Bedroom 1", "Bed", items).room == "Bedroom 1"


def test_rooms_of_removed_lines_are_not_snapped_to():
    gone = line(room="Living Room", status=REMOVED)
    assert decide("living room", "Lamp", [gone]).room == "living room"


# -- adds and duplicates -----------------------------------------------------


def test_new_work_is_an_add():
    d = decide("Living Room", "TV unit", [line()])
    assert d.outcome == "add" and d.target is None and d.duplicate_of is None


def test_add_matching_a_line_becomes_an_update_of_it():
    sofa = line()
    d = decide("Living Room", "Sofas", [sofa])
    assert d.outcome == "update" and d.target is sofa
    assert d.duplicate_of is sofa


def test_reworded_add_is_still_a_duplicate():
    wardrobe = line(room="Master Bedroom", description="Sliding door wardrobe")
    d = decide("Master Bedroom", "Wardrobe with sliding doors", [wardrobe])
    assert d.duplicate_of is wardrobe


def test_same_description_in_another_room_is_not_a_duplicate():
    assert decide("Study", "Sofa", [line()]).outcome == "add"


def test_a_distinct_item_in_the_same_room_is_not_a_duplicate():
    assert decide("Living Room", "False ceiling", [line()]).outcome == "add"


def test_case_and_room_spelling_do_not_hide_a_duplicate():
    sofa = line()
    d = decide("LIVING ROOM", "SOFA", [sofa])
    assert d.duplicate_of is sofa


def test_a_removed_line_is_never_a_duplicate_or_brought_back():
    d = decide("Living Room", "Sofa", [line(status=REMOVED)])
    assert d.outcome == "add" and d.duplicate_of is None


def test_best_of_several_matches_wins():
    near = line(description="Corner sofa set")
    exact = line(description="Sofa")
    assert decide("Living Room", "Sofa", [near, exact]).target is exact


def test_empty_quotation_is_all_adds():
    assert decide("Hall", "Mandir", []).outcome == "add"


# -- updates -----------------------------------------------------------------


def test_anchored_update_acts_on_exactly_that_line():
    near, target = line(description="Sofa"), line(description="Armchair")
    d = decide(
        "Living Room",
        "Sofa",
        [near, target],
        action="update",
        target_item_id=str(target.id),
    )
    assert d.outcome == "update" and d.target is target


def test_anchor_beats_a_closer_description_even_in_another_room():
    other_room = line(room="Study", description="Desk")
    d = decide(
        "Living Room",
        "Sofa",
        [line(), other_room],
        action="update",
        target_item_id=str(other_room.id),
    )
    assert d.target is other_room


def test_anchored_update_on_a_removed_line_does_nothing():
    gone = line(status=REMOVED)
    d = decide(
        "Living Room",
        "Sofa",
        [gone, line(description="Sofa set")],
        action="update",
        target_item_id=str(gone.id),
    )
    assert d.outcome == "skip" and d.target is None and d.reason


def test_anchor_on_a_missing_line_falls_back_to_a_description_match():
    sofa = line()
    d = decide(
        "Living Room",
        "Sofa",
        [sofa],
        action="update",
        target_item_id=str(uuid.uuid4()),
    )
    assert d.outcome == "update" and d.target is sofa


def test_anchor_on_a_missing_line_with_no_match_does_nothing():
    d = decide(
        "Hall",
        "Mandir",
        [line()],
        action="update",
        target_item_id=str(uuid.uuid4()),
    )
    assert d.outcome == "skip"


def test_unanchored_update_with_no_match_keeps_the_information_as_an_add():
    assert decide("Hall", "Mandir", [], action="update").outcome == "add"


def test_unanchored_update_is_not_flagged_a_duplicate():
    d = decide("Living Room", "Sofa", [line()], action="update")
    assert d.outcome == "update" and d.duplicate_of is None


@pytest.mark.parametrize("anchor", ["", "   ", None])
def test_a_blank_anchor_is_no_anchor(anchor):
    sofa = line()
    d = decide(
        "Living Room", "Sofa", [sofa], action="update", target_item_id=anchor
    )
    assert d.target is sofa


def test_add_carrying_a_live_anchor_updates_that_line():
    sofa = line()
    d = decide("Living Room", "Anything", [sofa], target_item_id=str(sofa.id))
    assert d.outcome == "update" and d.target is sofa


def test_add_carrying_a_removed_anchor_adds_a_new_line():
    gone = line(status=REMOVED)
    d = decide("Living Room", "Sofa", [gone], target_item_id=str(gone.id))
    assert d.outcome == "add"


# -- removals ----------------------------------------------------------------


def test_anchored_remove_targets_that_line():
    sofa = line()
    d = decide("x", "y", [sofa], action="remove", target_item_id=str(sofa.id))
    assert d.outcome == "remove" and d.target is sofa


def test_remove_by_description_when_unanchored():
    sofa = line()
    d = decide("Living Room", "Sofa", [sofa], action="remove")
    assert d.outcome == "remove" and d.target is sofa


def test_removing_an_already_removed_line_does_nothing():
    gone = line(status=REMOVED)
    d = decide(
        "Living Room",
        "Sofa",
        [gone],
        action="remove",
        target_item_id=str(gone.id),
    )
    assert d.outcome == "skip"


def test_remove_with_nothing_matching_does_nothing():
    d = decide("Hall", "Mandir", [line()], action="remove")
    assert d.outcome == "skip" and d.reason


# -- batches -----------------------------------------------------------------


def test_a_line_already_changed_in_the_batch_is_not_matched_by_description():
    sofa = line()
    d = decide("Living Room", "Sofa", [sofa], taken={id(sofa)})
    assert d.outcome == "add"


def test_an_anchored_row_may_still_reach_a_line_taken_earlier():
    sofa = line()
    d = decide(
        "Living Room",
        "Sofa",
        [sofa],
        action="update",
        target_item_id=str(sofa.id),
        taken={id(sofa)},
    )
    assert d.outcome == "update" and d.target is sofa


def test_the_decision_is_repeatable():
    items = [line(), line(description="Lamp")]
    first = decide("living room", "Sofas", items)
    second = decide("living room", "Sofas", items)
    assert first == second


def test_decide_does_not_mutate_the_lines():
    sofa = line()
    before = (sofa.room, sofa.description, sofa.status)
    decide("living room", "Sofas", [sofa], action="remove")
    assert (sofa.room, sofa.description, sofa.status) == before


# -- single-row callers ------------------------------------------------------


def test_unconfirmed_duplicate_is_refused_with_409():
    d = decide("Living Room", "Sofa", [line()])
    with pytest.raises(IntakeRejected) as err:
        refuse_duplicate(d, allow_duplicate=False)
    assert err.value.status_code == 409
    assert "Sofa" in str(err.value) and "Living Room" in str(err.value)


def test_confirmed_duplicate_is_allowed():
    refuse_duplicate(decide("Living Room", "Sofa", [line()]), True)


def test_a_non_duplicate_is_never_refused():
    refuse_duplicate(decide("Living Room", "Lamp", [line()]), False)


# -- the same rules through the checkpoint merge -----------------------------


def merge(items, rows):
    quotation = _quotation(items)
    result = merge_checkpoint_items(
        quotation, uuid.uuid4(), rows, FakeSession()
    )
    return quotation, result


def test_merge_uses_the_quotations_room_spelling_for_new_lines():
    quotation, result = merge(
        [line(room="Living Room")], [Incoming("living room", "Lamp")]
    )
    assert result.added == 1
    assert {i.room for i in quotation.line_items} == {"Living Room"}


def test_merge_never_brings_a_removed_line_back():
    gone = line(status=REMOVED, rate=100)
    _, result = merge([gone], [Incoming("Living Room", "Sofa", rate=500)])
    assert gone.status == REMOVED and gone.rate == 100
    assert result.added == 1 and result.updated == 0


def test_merge_update_anchored_on_a_removed_line_is_skipped_not_revived():
    gone = line(status=REMOVED)
    _, result = merge(
        [gone],
        [
            Anchored(
                "Living Room",
                "Sofa",
                action="update",
                target_item_id=str(gone.id),
                rate=9,
            )
        ],
    )
    assert result.skipped == 1 and gone.status == REMOVED


def test_merge_remove_of_an_already_removed_line_is_not_counted():
    gone = line(status=REMOVED)
    _, result = merge(
        [gone],
        [
            Anchored(
                "Living Room",
                "Sofa",
                action="remove",
                target_item_id=str(gone.id),
            )
        ],
    )
    assert result.marked_removed == 0 and result.skipped == 1


def test_merge_rows_of_one_meeting_are_never_folded_into_each_other():
    # "Wardrobe 1" / "Wardrobe 2" read alike but are two lines; only lines
    # that were already in the quotation can absorb a row.
    quotation, result = merge(
        [], [Incoming("Hall", "Wardrobe 1"), Incoming("Hall", "Wardrobe 2")]
    )
    assert result.added == 2 and result.updated == 0
    assert len(quotation.line_items) == 2


def test_merge_remove_then_update_in_one_batch_does_not_revive():
    sofa = line()
    _, result = merge(
        [sofa],
        [
            Anchored(
                "Living Room",
                "Sofa",
                action="remove",
                target_item_id=str(sofa.id),
            ),
            Anchored(
                "Living Room",
                "Sofa",
                action="update",
                target_item_id=str(sofa.id),
                rate=5,
            ),
        ],
    )
    assert sofa.status == REMOVED
    assert result.marked_removed == 1 and result.skipped == 1


def test_merge_skips_a_blank_row_instead_of_failing_the_meeting():
    quotation, result = merge(
        [], [Incoming("", "Sofa"), Incoming("Hall", "Mandir")]
    )
    assert result.skipped == 1 and result.added == 1
    assert [i.description for i in quotation.line_items] == ["Mandir"]


def test_merge_stores_tidy_text():
    quotation, _ = merge([], [Incoming("  Hall ", "  Mandir   unit ")])
    [created] = quotation.line_items
    assert (created.room, created.description) == ("Hall", "Mandir unit")


def test_merge_is_repeatable_for_the_same_meeting_and_lines():
    rows = [Incoming("Hall", "Mandir"), Incoming("Hall", "TV unit")]
    first, _ = merge([line(room="Hall", description="Mandir")], rows)
    second, _ = merge([line(room="Hall", description="Mandir")], rows)
    assert [i.description for i in first.line_items] == [
        i.description for i in second.line_items
    ]
