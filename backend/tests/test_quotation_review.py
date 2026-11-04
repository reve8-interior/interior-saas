import uuid

from backend.models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from backend.services.quotation_review import review_quotation

from .conftest import (
    as_business,
    auth,
    make_business,
    make_client_row,
    make_user,
)


def li(room="Hall", description="TV unit", price=10000, rate=1000, **kw):
    item = QuotationLineItem(
        id=uuid.uuid4(),
        room=room,
        description=description,
        unit="sqft",
        rate=rate,
        initial_price=price,
        status=kw.pop("status", QuotationItemStatus.priced),
        **kw,
    )
    return item


def codes(items):
    return [f.code for f in review_quotation(items).findings]


def test_clean_quotation_has_no_findings():
    assert codes([li()]) == []


def test_empty_quotation_is_an_error():
    review = review_quotation([])
    assert [f.code for f in review.findings] == ["empty_quotation"]
    assert review.items_checked == 0


def test_item_without_price_is_an_error_and_listed_first():
    review = review_quotation(
        [li(room="Kitchen", description="Wardrobe"), li(price=None, rate=None)]
    )
    assert review.findings[0].code == "missing_price"
    assert review.findings[0].severity == "error"


def test_removed_items_are_ignored():
    assert codes([li(price=None, status=QuotationItemStatus.removed)]) == [
        "empty_quotation"
    ]


def test_near_identical_items_in_one_room_are_duplicates():
    found = codes([li(description="TV unit"), li(description="TV unit")])
    assert "possible_duplicate" in found


def test_same_description_in_different_rooms_is_fine():
    assert codes([li(room="Hall"), li(room="Bedroom")]) == []


def test_wardrobe_without_hardware_is_a_hint():
    review = review_quotation([li(room="Bedroom", description="Wardrobe")])
    assert [f.code for f in review.findings] == ["possible_missing_item"]
    assert review.findings[0].severity == "info"


def test_wardrobe_with_handles_line_is_not_flagged():
    found = codes(
        [
            li(room="Bedroom", description="Wardrobe"),
            li(room="Bedroom", description="Handles and hinges"),
        ]
    )
    assert "possible_missing_item" not in found


def test_rate_outlier_against_the_quotations_own_rates():
    items = [
        li(description=f"Panel {n}", rate=1000 + n * 10) for n in range(3)
    ] + [li(description="Shelf", rate=20000)]
    assert "rate_outlier" in codes(items)


def test_review_endpoint_requires_a_quotation(api, db):
    biz = make_business(db)
    user = make_user(db, business=biz)
    as_business(db, biz.id)
    client = make_client_row(db, "C")
    r = api.get(
        f"/api/v1/clients/{client.id}/quotation/review", headers=auth(user)
    )
    assert r.status_code == 404
