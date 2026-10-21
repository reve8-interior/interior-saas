"""Parsing an (optionally hand-edited) version export back into rows."""

from io import BytesIO

import pytest
from openpyxl import Workbook

from backend.models.quotation_line_item import QuotationItemStatus
from backend.services.quotation_version_xlsx import (
    MAX_ROWS,
    ImportFileError,
    parse_version_xlsx,
)

HEADER = ["Room", "Description", "Unit", "Qty", "Rate", "Status"]
OK_ROW = ["Hall", "Paint", "ls", 1, 1, None]


def _xlsx(rows: list[list], header=HEADER, sheet="Quotation") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet
    if header is not None:
        ws.append(header)
    for row in rows:
        ws.append(row)
    out = BytesIO()
    wb.save(out)
    return out.getvalue()


def test_parses_rows_with_normalised_units_and_numbers():
    [item] = parse_version_xlsx(
        _xlsx([["Kitchen", "Cabinets", "SFT", "₹1,200.50", 99, "Priced"]])
    )
    assert item["room"] == "Kitchen"
    assert item["unit"] == "sqft"
    assert item["qty"] == 1200.5
    assert item["rate"] == 99.0
    assert item["status"] == QuotationItemStatus.priced
    assert item["extra"] == {}


def test_header_matching_is_case_insensitive_and_order_free():
    data = _xlsx(
        [["Sofa", "Hall", "nos"]],
        header=["description", "ROOM", " Unit "],
    )
    [item] = parse_version_xlsx(data)
    assert (item["room"], item["description"]) == ("Hall", "Sofa")


def test_blank_unit_defaults_to_lumpsum_and_blank_status_is_dropped():
    [item] = parse_version_xlsx(_xlsx([["Hall", "Paint", None, 1, 1, None]]))
    assert item["unit"] == "lumpsum"
    assert "status" not in item


def test_status_accepts_spaced_labels():
    [item] = parse_version_xlsx(
        _xlsx([["Hall", "Paint", "ls", 1, 1, "Pending Clarity"]])
    )
    assert item["status"] == QuotationItemStatus.pending_clarity


def test_extra_columns_keep_non_empty_values_only():
    data = _xlsx(
        [["Hall", "Paint", "Asian", None, None]],
        header=[
            "Room",
            "Description",
            "extra:Brand",
            "extra:Finish",
            "extra:",
        ],
    )
    [item] = parse_version_xlsx(data)
    assert item["extra"] == {"Brand": "Asian"}


def test_blank_rows_are_skipped():
    items = parse_version_xlsx(
        _xlsx(
            [
                OK_ROW,
                [None] * 6,
                ["  ", "", None, None, None, None],
                ["Bed", "Bed", "nos", 1, 1, None],
            ]
        )
    )
    assert [i["room"] for i in items] == ["Hall", "Bed"]


def test_falls_back_to_active_sheet_when_not_named_quotation():
    [item] = parse_version_xlsx(_xlsx([OK_ROW], sheet="Sheet1"))
    assert item["room"] == "Hall"


@pytest.mark.parametrize(
    ("data", "message"),
    [
        (b"not an excel file", "not a valid Excel"),
        (_xlsx([], header=None), "empty"),
        (_xlsx([], header=["Room", "Qty"]), "required"),
        (_xlsx([OK_ROW], header=["Qty", "Rate"]), "required"),
        (_xlsx([]), "no line items"),
    ],
)
def test_structural_errors(data, message):
    with pytest.raises(ImportFileError, match=message):
        parse_version_xlsx(data)


@pytest.mark.parametrize(
    ("row", "message"),
    [
        (["Hall", "Paint", "ls", "abc", 1, None], "Row 2.*not a number"),
        (["Hall", "Paint", "ls", -5, 1, None], "negative"),
        (["Hall", "Paint", "ls", 1, 1, "Bogus"], "unknown status"),
        ([None, "Paint", "ls", 1, 1, None], "room is empty"),
        (["Hall", None, "ls", 1, 1, None], "description is empty"),
        (["R" * 101, "Paint", "ls", 1, 1, None], "longer than 100"),
        (["Hall", "D" * 501, "ls", 1, 1, None], "longer than 500"),
    ],
)
def test_row_errors_name_the_row(row, message):
    with pytest.raises(ImportFileError, match=message):
        parse_version_xlsx(_xlsx([row]))


def test_error_reports_spreadsheet_row_number():
    rows = [OK_ROW, OK_ROW, ["Hall", "Paint", "ls", "x", 1, None]]
    with pytest.raises(ImportFileError, match="Row 4"):
        parse_version_xlsx(_xlsx(rows))


def test_row_limit_is_enforced():
    rows = [
        ["Hall", f"Item {i}", "ls", 1, 1, None] for i in range(MAX_ROWS + 1)
    ]
    with pytest.raises(ImportFileError, match="More than"):
        parse_version_xlsx(_xlsx(rows))
