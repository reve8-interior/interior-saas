"""Unit tests for the deterministic dimension parser.

All dimension fixtures below are verbatim strings from a real client
quotation ("Ravi Kumar SKy Park Quotation.xlsx") — trailing spaces,
mixed quote marks and all.
"""

from decimal import Decimal

import pytest

from backend.services.dimension_parser import (
    normalize_unit,
    parse_dimension,
)


class TestParseDimension:
    def test_feet_only(self):
        parsed = parse_dimension("5'x3' ")
        assert parsed is not None
        assert parsed.width_ft == Decimal("5")
        assert parsed.height_ft == Decimal("3")
        assert parsed.sqft == Decimal("15.00")

    def test_feet_and_inches_both_sides(self):
        parsed = parse_dimension("6'3\"x1'6\"")
        assert parsed is not None
        assert parsed.width_ft == Decimal("6.25")
        assert parsed.height_ft == Decimal("1.5")
        assert parsed.sqft == Decimal("9.38")

    def test_inches_on_one_side_only(self):
        parsed = parse_dimension("6'x5'6\"")
        assert parsed is not None
        assert parsed.sqft == Decimal("33.00")

    def test_fractional_inches_after_feet(self):
        # 7'.5" = 7 feet 0.5 inch
        parsed = parse_dimension("11'x7'.5\"")
        assert parsed is not None
        assert parsed.width_ft == Decimal("11")
        assert parsed.height_ft == Decimal("7") + Decimal("0.5") / Decimal(
            "12"
        )

    def test_bare_numbers_treated_as_feet(self):
        parsed = parse_dimension("10x4")
        assert parsed is not None
        assert parsed.sqft == Decimal("40.00")

    def test_uppercase_and_star_separators(self):
        assert parse_dimension("5'X3'") is not None
        assert parse_dimension("5'*3'") is not None
        assert parse_dimension("5'×3'") is not None

    def test_raw_is_preserved_trimmed(self):
        parsed = parse_dimension("  5'x3'  ")
        assert parsed is not None
        assert parsed.raw == "5'x3'"

    @pytest.mark.parametrize(
        "raw",
        [
            "",
            "   ",
            "abc",
            "5'",  # single side — area is ambiguous
            "5'x3'x2'",  # three sides
            "x3'",
            "5'xabc",
        ],
    )
    def test_unparseable_returns_none(self, raw: str):
        assert parse_dimension(raw) is None


class TestNormalizeUnit:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("Sqft", "sqft"),
            ("sqft", "sqft"),
            ("sft", "sqft"),
            ("no's", "nos"),
            ("Count", "nos"),
            ("nos", "nos"),
            ("Dimension", "dimension"),
            ("dimensions", "dimension"),
            ("  Sqft  ", "sqft"),
        ],
    )
    def test_known_aliases(self, raw: str, expected: str):
        assert normalize_unit(raw) == expected

    def test_unknown_unit_passes_through_lowercased(self):
        assert normalize_unit("Rmt") == "rmt"
