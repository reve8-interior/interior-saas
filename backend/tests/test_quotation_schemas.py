"""Unit tests for quotation line-item Pydantic schemas."""

import pytest
from pydantic import ValidationError

from backend.models.quotation_line_item import (
    QuotationCatalogType,
    QuotationItemStatus,
)
from backend.schemas.quotation import (
    QuotationLineItemCreate,
    QuotationLineItemUpdate,
)


class TestQuotationLineItemCreate:
    def test_minimal_valid(self):
        item = QuotationLineItemCreate(
            room="Living Room", description="TV Unit Back Panel", unit="Sqft"
        )
        assert item.catalog_type == QuotationCatalogType.core_works
        assert item.position == 0
        assert item.qty is None

    def test_full_valid(self):
        item = QuotationLineItemCreate(
            room="Kitchen",
            description="L shape base unit carcass",
            unit="Sqft",
            catalog_type=QuotationCatalogType.core_works,
            qty=32,
            rate=1850,
            remarks="Chimney shall be included on the proposal",
        )
        assert item.rate == 1850

    @pytest.mark.parametrize(
        "field, value",
        [
            ("room", ""),
            ("description", ""),
            ("unit", ""),
            ("qty", -1),
            ("rate", -0.5),
            ("initial_price", -100),
            ("negotiated_price", -100),
            ("position", -1),
        ],
    )
    def test_invalid_values_rejected(self, field: str, value: object):
        payload: dict[str, object] = {
            "room": "Balcony",
            "description": "Tulasi kota",
            "unit": "nos",
        }
        payload[field] = value
        with pytest.raises(ValidationError):
            QuotationLineItemCreate(**payload)  # type: ignore[arg-type]

    def test_overlong_dimension_rejected(self):
        with pytest.raises(ValidationError):
            QuotationLineItemCreate(
                room="Balcony",
                description="Grass panel",
                unit="dimension",
                raw_dimension="x" * 51,
            )


class TestQuotationLineItemUpdate:
    def test_partial_update_only_sends_set_fields(self):
        update = QuotationLineItemUpdate(negotiated_price=257000)
        assert update.model_dump(exclude_unset=True) == {
            "negotiated_price": 257000.0
        }

    def test_status_accepts_enum_value(self):
        update = QuotationLineItemUpdate(
            status=QuotationItemStatus.pending_clarity
        )
        assert update.status == QuotationItemStatus.pending_clarity

    def test_invalid_status_rejected(self):
        with pytest.raises(ValidationError):
            QuotationLineItemUpdate(status="approved-ish")  # type: ignore[arg-type]

    def test_empty_room_rejected(self):
        with pytest.raises(ValidationError):
            QuotationLineItemUpdate(room="")
