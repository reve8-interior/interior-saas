"""Unit tests for checkpoint→quotation merging and quotation diffing.

No DB required: merge is exercised with transient ORM objects and a
duck-typed fake session.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal

from backend.models.quotation import Quotation, QuotationStatus
from backend.models.quotation_line_item import (
    QuotationCatalogType,
    QuotationItemStatus,
    QuotationLineItem,
)
from backend.services.checkpoint_merge import (
    description_similarity,
    find_matching_item,
    merge_checkpoint_items,
)
from backend.services.column_settings import (
    DEFAULT_LINE_ITEM_COLUMNS,
    missing_required_problems,
)
from backend.services.quotation_diff import (
    attach_item_ids,
    compute_quotation_diff,
)


@dataclass
class Incoming:
    room: str
    description: str
    unit: str = "sqft"
    raw_dimension: str | None = None
    qty: float | None = None
    rate: float | None = None
    est_time: str | None = None
    remarks: str | None = None
    catalog_type: str = "core_works"
    extra: dict[str, object] = field(default_factory=dict)


class FakeSession:
    """Duck-typed stand-in for sqlalchemy Session in unit tests."""

    def __init__(self) -> None:
        self.added: list[object] = []
        self.deleted: list[object] = []

    def add(self, obj: object) -> None:
        self.added.append(obj)

    def delete(self, obj: object) -> None:
        self.deleted.append(obj)

    def flush(self) -> None:
        pass


def _item(**overrides: object) -> QuotationLineItem:
    now = datetime.now(timezone.utc)
    defaults: dict[str, object] = {
        "id": uuid.uuid4(),
        "quotation_id": uuid.uuid4(),
        "room": "Master Bedroom",
        "position": 0,
        "description": "Wardrobe with sliding doors",
        "unit": "sqft",
        "catalog_type": QuotationCatalogType.core_works,
        "status": QuotationItemStatus.draft,
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return QuotationLineItem(**defaults)


def _quotation(items: list[QuotationLineItem]) -> Quotation:
    now = datetime.now(timezone.utc)
    quotation = Quotation(
        id=uuid.uuid4(),
        client_id=uuid.uuid4(),
        design_id=None,
        status=QuotationStatus.pending,
        created_at=now,
        updated_at=now,
    )
    quotation.line_items = items
    return quotation


class TestMatching:
    def test_identical_descriptions_match(self):
        assert description_similarity("Wardrobe", "wardrobe") == 1.0

    def test_reworded_description_matches(self):
        score = description_similarity(
            "Wardrobe with sliding doors", "Sliding door wardrobe"
        )
        assert score >= 0.72

    def test_distinct_items_do_not_match(self):
        score = description_similarity("Wardrobe", "Study table")
        assert score < 0.72

    def test_same_description_different_room_is_no_match(self):
        existing = _item(room="Kitchen", description="False ceiling")
        assert (
            find_matching_item("Living Room", "False ceiling", [existing])
            is None
        )

    def test_best_candidate_wins(self):
        wardrobe = _item(description="Wardrobe with sliding doors")
        tv_unit = _item(description="TV unit back panel")
        match = find_matching_item(
            "Master Bedroom", "sliding wardrobe", [tv_unit, wardrobe]
        )
        assert match is wardrobe


class TestMergeCheckpointItems:
    def test_re_mentioned_item_updates_instead_of_duplicating(self):
        cp1, cp2 = uuid.uuid4(), uuid.uuid4()
        existing = _item(
            source_checkpoint_id=cp1,
            raw_dimension="6x8",
            rate=Decimal("450"),
        )
        quotation = _quotation([existing])
        db = FakeSession()

        result = merge_checkpoint_items(
            quotation,
            cp2,
            [
                Incoming(
                    room="Master Bedroom",
                    description="Wardrobe with sliding doors",
                    raw_dimension="7x8",
                    rate=500,
                )
            ],
            db,
        )

        assert result.updated == 1
        assert result.added == 0
        assert len(quotation.line_items) == 1
        assert existing.raw_dimension == "7x8"
        assert float(existing.rate) == 500.0
        assert existing.source_checkpoint_id == cp2

    def test_new_work_is_appended(self):
        cp2 = uuid.uuid4()
        existing = _item(position=0)
        quotation = _quotation([existing])
        db = FakeSession()

        result = merge_checkpoint_items(
            quotation,
            cp2,
            [Incoming(room="Kitchen", description="Modular kitchen base")],
            db,
        )

        assert result.added == 1
        assert result.updated == 0
        assert len(quotation.line_items) == 2
        new_item = quotation.line_items[1]
        assert new_item.room == "Kitchen"
        assert new_item.position == 1
        assert new_item.source_checkpoint_id == cp2

    def test_pricing_change_resets_negotiation(self):
        existing = _item(
            qty=Decimal("4"),
            rate=Decimal("450"),
            initial_price=Decimal("1800"),
            negotiated_price=Decimal("1600"),
            status=QuotationItemStatus.agreed,
        )
        quotation = _quotation([existing])

        merge_checkpoint_items(
            quotation,
            uuid.uuid4(),
            [
                Incoming(
                    room="Master Bedroom",
                    description="Wardrobe with sliding doors",
                    qty=6,
                    rate=450,
                )
            ],
            FakeSession(),
        )

        assert existing.negotiated_price is None
        assert float(existing.initial_price) == 2700.0
        assert existing.status == QuotationItemStatus.priced

    def test_unchanged_mention_keeps_negotiation(self):
        existing = _item(
            qty=Decimal("4"),
            rate=Decimal("450"),
            initial_price=Decimal("1800"),
            negotiated_price=Decimal("1600"),
            status=QuotationItemStatus.agreed,
        )
        quotation = _quotation([existing])

        merge_checkpoint_items(
            quotation,
            uuid.uuid4(),
            [
                Incoming(
                    room="Master Bedroom",
                    description="Wardrobe with sliding doors",
                    qty=4,
                    rate=450,
                    remarks="client confirmed",
                )
            ],
            FakeSession(),
        )

        assert float(existing.negotiated_price) == 1600.0
        assert existing.status == QuotationItemStatus.agreed
        assert existing.remarks == "client confirmed"

    def test_unstated_fields_keep_existing_values(self):
        existing = _item(raw_dimension="6x8", rate=Decimal("450"))
        quotation = _quotation([existing])

        merge_checkpoint_items(
            quotation,
            uuid.uuid4(),
            [
                Incoming(
                    room="Master Bedroom",
                    description="Wardrobe with sliding doors",
                )
            ],
            FakeSession(),
        )

        assert existing.raw_dimension == "6x8"
        assert float(existing.rate) == 450.0

    def test_reapplying_checkpoint_drops_its_stale_items(self):
        cp = uuid.uuid4()
        kept = _item(description="Wardrobe with sliding doors")
        stale = _item(
            room="Kitchen",
            description="Chimney installation",
            source_checkpoint_id=cp,
        )
        quotation = _quotation([kept, stale])
        db = FakeSession()

        result = merge_checkpoint_items(
            quotation,
            cp,
            [
                Incoming(
                    room="Master Bedroom",
                    description="Wardrobe with sliding doors",
                )
            ],
            db,
        )

        assert result.removed == 1
        assert stale in db.deleted
        assert quotation.line_items == [kept]


@dataclass
class Anchored(Incoming):
    """An incoming item as the extraction agent now produces it."""

    action: str = "add"
    target_item_id: str | None = None


class TestAnchoredMerge:
    def test_target_id_beats_a_closer_description_in_the_same_room(self):
        """The id is the truth; similarity must not override it.

        Two near-identical wardrobes in one room is the exact case
        fuzzy matching gets wrong and the ref anchor gets right.
        """
        cp = uuid.uuid4()
        small = _item(
            room="Kids bed room", description="wardrobe", qty=Decimal("45")
        )
        large = _item(
            room="Kids bed room", description="Wardrobe", qty=Decimal("55")
        )
        quotation = _quotation([small, large])
        db = FakeSession()

        result = merge_checkpoint_items(
            quotation,
            cp,
            [
                Anchored(
                    room="Kids bed room",
                    description="Wardrobe",
                    action="update",
                    target_item_id=str(small.id),
                    rate=1400,
                )
            ],
            db,
        )

        assert result.updated == 1 and result.added == 0
        assert small.rate == 1400
        assert large.rate is None

    def test_anchored_update_never_appends(self):
        cp = uuid.uuid4()
        existing = _item(room="Pooja unit", description="Storage")
        quotation = _quotation([existing])
        db = FakeSession()

        # The agent renamed the work; the anchor still lands it correctly.
        merge_checkpoint_items(
            quotation,
            cp,
            [
                Anchored(
                    room="Pooja unit",
                    description="Prayer cabinet",
                    action="update",
                    target_item_id=str(existing.id),
                    rate=1500,
                )
            ],
            db,
        )
        assert len(quotation.line_items) == 1
        assert existing.rate == 1500

    def test_unknown_target_id_falls_back_to_similarity(self):
        cp = uuid.uuid4()
        existing = _item(description="Wardrobe with sliding doors")
        quotation = _quotation([existing])
        db = FakeSession()

        result = merge_checkpoint_items(
            quotation,
            cp,
            [
                Anchored(
                    room="Master Bedroom",
                    description="Sliding door wardrobe",
                    action="update",
                    target_item_id=str(uuid.uuid4()),
                    rate=500,
                )
            ],
            db,
        )
        assert result.updated == 1
        assert existing.rate == 500

    def test_items_without_action_still_merge(self):
        """Manually typed rows and older checkpoints behave as before."""
        cp = uuid.uuid4()
        existing = _item(rate=Decimal("450"))
        quotation = _quotation([existing])
        db = FakeSession()

        result = merge_checkpoint_items(
            quotation,
            cp,
            [
                Incoming(
                    room="Master Bedroom",
                    description="Sliding door wardrobe",
                    rate=500,
                )
            ],
            db,
        )
        assert result.updated == 1
        assert existing.rate == 500


class TestRemovals:
    def test_remove_marks_the_item_rather_than_deleting_it(self):
        cp = uuid.uuid4()
        existing = _item(
            room="Balcony",
            description="Tulasi kota base",
            status=QuotationItemStatus.agreed,
        )
        quotation = _quotation([existing])
        db = FakeSession()

        result = merge_checkpoint_items(
            quotation,
            cp,
            [
                Anchored(
                    room="Balcony",
                    description="Tulasi kota base",
                    action="remove",
                    target_item_id=str(existing.id),
                )
            ],
            db,
        )

        assert result.marked_removed == 1
        assert result.added == 0 and result.updated == 0
        # Kept on the quotation for the audit trail, priced out of it.
        assert existing in quotation.line_items
        assert existing.status == QuotationItemStatus.removed
        assert db.deleted == []

    def test_remove_with_no_match_creates_nothing(self):
        cp = uuid.uuid4()
        quotation = _quotation([_item()])
        db = FakeSession()

        result = merge_checkpoint_items(
            quotation,
            cp,
            [
                Anchored(
                    room="Bathroom", description="Jacuzzi", action="remove"
                )
            ],
            db,
        )
        assert result.added == 0 and result.marked_removed == 0
        assert len(quotation.line_items) == 1

    def test_removed_item_is_not_swept_as_a_stale_leftover(self):
        """A removal claims its target, so re-apply cleanup skips it."""
        cp = uuid.uuid4()
        existing = _item(source_checkpoint_id=cp, description="Deck flooring")
        quotation = _quotation([existing])
        db = FakeSession()

        result = merge_checkpoint_items(
            quotation,
            cp,
            [
                Anchored(
                    room="Master Bedroom",
                    description="Deck flooring",
                    action="remove",
                    target_item_id=str(existing.id),
                )
            ],
            db,
        )
        assert result.removed == 0
        assert existing in quotation.line_items
        assert existing.status == QuotationItemStatus.removed


class TestMissingRequiredProblems:
    def test_default_columns_flag_blank_builtins(self):
        items = [Incoming(room="Kitchen", description="Chimney", unit="  ")]
        problems = missing_required_problems(items, DEFAULT_LINE_ITEM_COLUMNS)
        assert problems == ["Kitchen — Chimney: missing Unit"]

    def test_custom_required_column_read_from_extra(self):
        columns = DEFAULT_LINE_ITEM_COLUMNS + [
            {
                "key": "brand",
                "label": "Brand",
                "type": "text",
                "required": True,
                "builtin": False,
                "enabled": True,
                "locked": False,
            }
        ]
        filled = Incoming(
            room="Kitchen", description="Chimney", extra={"brand": "Faber"}
        )
        blank = Incoming(room="Kitchen", description="Hob", extra={})
        problems = missing_required_problems([filled, blank], columns)
        assert problems == ["Kitchen — Hob: missing Brand"]

    def test_disabled_required_column_is_not_enforced(self):
        columns = [
            {**c, "enabled": False} if c["key"] == "unit" else c
            for c in DEFAULT_LINE_ITEM_COLUMNS
        ]
        items = [Incoming(room="Kitchen", description="Chimney", unit="")]
        assert missing_required_problems(items, columns) == []


class TestComputeQuotationDiff:
    def _baseline(self, **overrides: object) -> dict:
        base: dict[str, object] = {
            "room": "Master Bedroom",
            "description": "Wardrobe with sliding doors",
            "unit": "sqft",
            "raw_dimension": "6x8",
            "qty": None,
            "rate": 450.0,
            "initial_price": 21600.0,
            "negotiated_price": None,
            "remarks": None,
            "status": "priced",
        }
        base.update(overrides)
        return base

    def test_added_removed_changed_and_unchanged(self):
        current = [
            _item(  # unchanged
                raw_dimension="6x8",
                rate=Decimal("450"),
                initial_price=Decimal("21600"),
                status=QuotationItemStatus.priced,
            ),
            _item(  # changed rate
                room="Kitchen",
                description="Modular kitchen base",
                rate=Decimal("600"),
            ),
            _item(  # added
                room="Living Room",
                description="TV unit back panel",
            ),
        ]
        baseline = [
            self._baseline(),
            self._baseline(
                room="Kitchen",
                description="Modular kitchen base",
                raw_dimension=None,
                rate=500.0,
                initial_price=None,
                status="draft",
            ),
            self._baseline(  # removed
                room="Balcony",
                description="Wooden deck flooring",
            ),
        ]

        added, removed, changed, unchanged = compute_quotation_diff(
            current, baseline
        )

        assert unchanged == 1
        assert [a.description for a in added] == ["TV unit back panel"]
        assert [r.description for r in removed] == ["Wooden deck flooring"]
        assert len(changed) == 1
        rate_change = next(c for c in changed[0].changes if c.field == "rate")
        assert rate_change.old == 500.0
        assert rate_change.new == 600.0

    def test_no_baseline_reports_everything_added(self):
        current = [_item()]
        added, removed, changed, unchanged = compute_quotation_diff(
            current, []
        )
        assert len(added) == 1
        assert removed == []
        assert changed == []
        assert unchanged == 0

    def test_snapshot_vs_snapshot_target_accepts_dicts(self):
        # "What did checkpoint X change": both sides are snapshot dicts.
        baseline = [self._baseline()]
        target = [
            self._baseline(rate=500.0, initial_price=24000.0),
            self._baseline(
                room="Kitchen",
                description="Chimney installation",
                raw_dimension=None,
                rate=None,
                initial_price=None,
                status="draft",
            ),
        ]

        added, removed, changed, unchanged = compute_quotation_diff(
            target, baseline
        )

        assert [a.description for a in added] == ["Chimney installation"]
        assert removed == []
        assert len(changed) == 1
        assert {c.field for c in changed[0].changes} == {
            "rate",
            "initial_price",
        }
        assert unchanged == 0


class TestAttachItemIds:
    def test_entries_resolve_to_live_items_or_none(self):
        live = _item(description="Wardrobe with sliding doors")
        added, removed, changed, _ = compute_quotation_diff(
            [live],
            [
                {
                    "room": "Master Bedroom",
                    "description": "Wardrobe sliding doors",
                    "rate": 500.0,
                },
                {"room": "Balcony", "description": "Wooden deck flooring"},
            ],
        )
        assert len(changed) == 1 and len(removed) == 1 and added == []

        attach_item_ids(changed, [live])
        attach_item_ids(removed, [live])

        assert changed[0].item_id == str(live.id)
        assert removed[0].item_id is None
