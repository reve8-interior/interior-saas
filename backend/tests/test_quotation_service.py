"""Unit tests for quotation domain logic (no DB required)."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from backend.models.quotation import Quotation, QuotationStatus
from backend.models.quotation_line_item import (
    QuotationCatalogType,
    QuotationItemStatus,
    QuotationLineItem,
)
from backend.schemas.quotation import QuotationDerivedState
from backend.services.quotation_service import (
    build_quotation_view,
    derive_state,
    resolve_line_item,
)


def _item(**overrides: object) -> QuotationLineItem:
    # Transient ORM objects skip flush-time defaults, so set them here.
    now = datetime.now(timezone.utc)
    defaults: dict[str, object] = {
        "id": uuid.uuid4(),
        "quotation_id": uuid.uuid4(),
        "room": "Living Room",
        "position": 0,
        "description": "TV Unit Back Panel",
        "unit": "Sqft",
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


class TestResolveLineItem:
    def test_dimension_resolved_to_sqft_and_price(self):
        item = _item(
            unit="Dimension", raw_dimension="5'x3' ", rate=Decimal("450")
        )
        resolve_line_item(item)
        assert item.unit == "dimension"
        assert item.computed_sqft == Decimal("15.00")
        assert item.initial_price == Decimal("6750.00")
        assert item.status == QuotationItemStatus.priced

    def test_unparseable_dimension_flags_pending_clarity(self):
        item = _item(unit="Dimension", raw_dimension="see drawing")
        resolve_line_item(item)
        assert item.computed_sqft is None
        assert item.initial_price is None
        assert item.status == QuotationItemStatus.pending_clarity

    def test_qty_times_rate_when_no_dimension(self):
        item = _item(unit="no's", qty=Decimal("4"), rate=Decimal("9500"))
        resolve_line_item(item)
        assert item.initial_price == Decimal("38000")
        assert item.status == QuotationItemStatus.priced

    def test_explicit_price_is_never_overwritten(self):
        item = _item(
            unit="Dimension",
            raw_dimension="5'x3'",
            rate=Decimal("450"),
            initial_price=Decimal("25000"),
        )
        resolve_line_item(item)
        assert item.initial_price == Decimal("25000")

    def test_no_rate_stays_draft(self):
        item = _item(unit="sqft", qty=Decimal("30"))
        resolve_line_item(item)
        assert item.initial_price is None
        assert item.status == QuotationItemStatus.draft

    def test_unset_status_is_treated_as_draft_and_promoted(self):
        # API-created items have status=None until flush; resolve must
        # still promote them once a price is derived.
        item = _item(unit="sqft", qty=Decimal("10"), rate=Decimal("100"))
        item.status = None  # type: ignore[assignment]
        resolve_line_item(item)
        assert item.status == QuotationItemStatus.priced


class TestDeriveState:
    def test_no_items_is_draft(self):
        assert derive_state([]) == QuotationDerivedState.draft

    def test_any_pending_clarity_wins(self):
        items = [
            _item(status=QuotationItemStatus.agreed),
            _item(status=QuotationItemStatus.pending_clarity),
        ]
        assert (
            derive_state(items) == QuotationDerivedState.clarification_needed
        )

    def test_all_agreed_is_ready_for_approval(self):
        items = [
            _item(status=QuotationItemStatus.agreed),
            _item(status=QuotationItemStatus.removed),
        ]
        assert derive_state(items) == QuotationDerivedState.ready_for_approval

    def test_mixed_priced_is_in_negotiation(self):
        items = [
            _item(status=QuotationItemStatus.priced),
            _item(status=QuotationItemStatus.draft),
        ]
        assert derive_state(items) == QuotationDerivedState.in_negotiation

    def test_only_removed_is_draft(self):
        items = [_item(status=QuotationItemStatus.removed)]
        assert derive_state(items) == QuotationDerivedState.draft


class TestBuildQuotationView:
    def test_groups_by_room_and_totals(self):
        items = [
            _item(
                room="Living Room",
                initial_price=Decimal("47700"),
                status=QuotationItemStatus.priced,
            ),
            _item(
                room="Living Room",
                initial_price=Decimal("38000"),
                negotiated_price=Decimal("30000"),
                status=QuotationItemStatus.agreed,
            ),
            _item(
                room="Kitchen",
                description="Counter top",
                initial_price=Decimal("47500"),
                status=QuotationItemStatus.pending_clarity,
            ),
        ]
        quotation = _quotation(items)
        view = build_quotation_view(quotation)

        assert view.id == quotation.id
        assert view.status == "pending"
        assert [r.room for r in view.rooms] == ["Living Room", "Kitchen"]
        living = view.rooms[0]
        assert living.initial_total == 85700.0
        # negotiated falls back to initial where not renegotiated
        assert living.negotiated_total == 77700.0
        assert view.initial_total == 133200.0
        assert view.pending_clarity_count == 1
        assert view.derived_state == QuotationDerivedState.clarification_needed

    def test_removed_items_excluded_from_totals_but_listed(self):
        items = [
            _item(
                initial_price=Decimal("18500"),
                status=QuotationItemStatus.agreed,
            ),
            _item(
                description="Vertical grass panel",
                initial_price=Decimal("12000"),
                status=QuotationItemStatus.removed,
            ),
        ]
        view = build_quotation_view(_quotation(items))
        assert view.initial_total == 18500.0
        assert view.negotiated_total == 18500.0
        assert len(view.rooms[0].items) == 2
