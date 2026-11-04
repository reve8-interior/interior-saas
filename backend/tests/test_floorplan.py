import io
import uuid
from unittest.mock import AsyncMock, patch

from sqlalchemy import select

from backend.agents.floorplan_agent import FloorPlanExtraction, FloorPlanRoom
from backend.models.agent_audit_log import AgentAuditLog
from backend.models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from backend.models.user import UserRole
from backend.schemas.floorplan import FloorPlanRoomOut
from backend.services.dimension_parser import parse_dimension
from backend.services.floorplan_draft import (
    PendingRow,
    draft_items,
    rate_for,
)
from backend.services.room_matching import match_rooms
from backend.services.secret_box import encrypt_secret

from .conftest import (
    as_business,
    as_owner,
    auth,
    make_business,
    make_client_row,
    make_user,
)

AGENT = "backend.services.floorplan_extraction.run_floorplan_extraction"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def room(name="Master Bedroom", length=12.0, width=10.0):
    return FloorPlanRoomOut(name=name, length_ft=length, width_ft=width)


def test_bedroom_gets_template_items_with_quantities():
    items, warnings = draft_items([room()], [])
    by_desc = {i.description: i for i in items}
    assert by_desc["Wardrobe"].qty == 70.0  # shorter side 10 x 7 ft
    assert by_desc["False ceiling"].qty == 120.0
    assert by_desc["Wardrobe"].rate is None
    assert warnings == []


def test_items_carry_a_parseable_dimension_that_matches_qty():
    items, _ = draft_items([room()], [])
    wardrobe = next(i for i in items if i.description == "Wardrobe")
    assert wardrobe.raw_dimension == "10'x7'"
    assert parse_dimension(wardrobe.raw_dimension).sqft == wardrobe.qty
    counted = next(i for i in items if i.description == "Bed back panel")
    assert counted.raw_dimension is None and counted.qty == 1.0


def quoted(description="Wardrobe", room="Master Bedroom", **kw):
    base = dict(unit="sqft", raw_dimension=None, qty=None, rate=None)
    return QuotationLineItem(
        id=uuid.uuid4(),
        room=room,
        description=description,
        status=QuotationItemStatus.priced,
        **{**base, **kw},
    )


def wardrobe_of(items):
    return next(i for i in items if i.description == "Wardrobe")


def test_existing_line_is_matched_not_dropped():
    line = quoted()
    items, _ = draft_items([room("Master Bed Room")], [], [line])
    match = wardrobe_of(items).match
    assert match is not None and match.id == str(line.id)


def test_row_from_an_earlier_draft_is_flagged_and_cannot_be_filled():
    earlier = [PendingRow(room="Master Bedroom", description="Wardrobe")]
    items, _ = draft_items([room()], [], [], earlier)
    match = wardrobe_of(items).match
    assert match is not None
    assert match.source == "draft" and match.id is None
    assert match.fills == []
    assert all(i.match for i in items if i.description == "Wardrobe")
    assert (
        next(i for i in items if i.description == "Bed back panel").match
        is None
    )


def test_line_without_size_can_be_filled_in():
    items, _ = draft_items([room("Master Bedroom")], [], [quoted()])
    assert wardrobe_of(items).match.fills == ["raw_dimension", "qty"]


def test_line_with_a_size_has_nothing_to_fill():
    line = quoted(raw_dimension="9'x7'", qty=63)
    items, _ = draft_items([room("Master Bedroom")], [], [line])
    assert wardrobe_of(items).match.fills == []


def test_rate_is_offered_only_when_the_line_has_none():
    book = [("Wardrobe", "sqft", 1500.0)]
    blank, _ = draft_items([room()], book, [quoted(rate=None)])
    priced, _ = draft_items([room()], book, [quoted(rate=1200)])
    assert "rate" in wardrobe_of(blank).match.fills
    assert "rate" not in wardrobe_of(priced).match.fills


def test_different_unit_is_never_filled():
    line = quoted(unit="nos")
    items, _ = draft_items([room()], [], [line])
    assert wardrobe_of(items).match.fills == []


def names(rooms):
    return [(r.name, r.match_status) for r in rooms]


def test_exact_names_match_despite_spacing_and_case():
    out = match_rooms(
        [room("Master Bed Room"), room("KITCHEN")],
        ["Master Bedroom", "Kitchen"],
    )
    assert names(out) == [
        ("Master Bedroom", "existing"),
        ("Kitchen", "existing"),
    ]
    assert out[0].plan_label == "Master Bed Room"


def test_generic_bedrooms_are_suggested_unclaimed_existing_ones():
    out = match_rooms(
        [room("Master Bedroom"), room("Bedroom 1"), room("Bedroom 2")],
        ["Master Bedroom", "Guest Bedroom", "Kids Bedroom"],
    )
    assert names(out) == [
        ("Master Bedroom", "existing"),
        ("Guest Bedroom", "suggested"),
        ("Kids Bedroom", "suggested"),
    ]
    assert out[1].plan_label == "Bedroom 1"


def test_specific_name_without_a_match_stays_new():
    out = match_rooms([room("Study")], ["Master Bedroom"])
    assert names(out) == [("Study", "new")]


def test_extra_generic_rooms_beyond_existing_are_new():
    out = match_rooms(
        [room("Bedroom 1"), room("Bedroom 2")], ["Guest Bedroom"]
    )
    assert names(out) == [("Guest Bedroom", "suggested"), ("Bedroom 2", "new")]


def test_rate_comes_from_the_business_rate_book():
    book = [("Wardrobe", "sqft", 1400.0), ("Wardrobe", "sqft", 1600.0)]
    items, _ = draft_items([room()], book)
    assert {i.description: i.rate for i in items}["Wardrobe"] == 1500.0


def test_rate_needs_matching_unit_and_similar_description():
    assert rate_for("Wardrobe", "sqft", [("Wardrobe", "nos", 9.0)]) is None
    assert rate_for("Wardrobe", "sqft", [("Sofa", "sqft", 9.0)]) is None


def test_room_without_dimensions_gets_items_without_quantities():
    items, warnings = draft_items([room(length=None, width=None)], [])
    assert items
    assert all(i.qty is None for i in items if i.unit == "sqft")
    assert "no dimensions" in warnings[0]


def test_implausible_side_is_warned():
    _, warnings = draft_items([room(length=120.0)], [])
    assert any("check the units" in w for w in warnings)


def test_unknown_room_type_has_no_items_and_a_warning():
    items, warnings = draft_items([room("Garage")], [])
    assert items == []
    assert "no starter items" in warnings[0]


def setup(db):
    biz = make_business(
        db, openai_api_key_enc=encrypt_secret("sk-" + "t" * 30)
    )
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    return user, make_client_row(db, "C")


def extract(api, user, client, content=PNG):
    return api.post(
        f"/api/v1/clients/{client.id}/quotation/floor-plan/extract",
        headers=auth(user),
        files={"file": ("plan.png", io.BytesIO(content), "image/png")},
    )


def test_extract_returns_rooms_and_logs_the_run(api, db):
    user, client = setup(db)
    result = FloorPlanExtraction(
        rooms=[FloorPlanRoom(name="Hall", length_ft=15, width_ft=12)]
    )
    with patch(AGENT, AsyncMock(return_value=(result, 100, 20))):
        r = extract(api, user, client)
    assert r.status_code == 200, r.text
    assert r.json()["rooms"][0]["name"] == "Hall"
    as_owner(db)
    [log] = db.scalars(select(AgentAuditLog)).all()
    assert log.operation == "floorplan_extract"
    assert log.prompt_version == "v1"
    assert log.proposed_output["rooms"][0]["name"] == "Hall"


def test_non_image_is_415_and_never_reaches_the_model(api, db):
    user, client = setup(db)
    with patch(AGENT, AsyncMock()) as agent:
        r = extract(api, user, client, content=b"not an image")
    assert r.status_code == 415
    agent.assert_not_called()


def test_unreadable_plan_is_422(api, db):
    user, client = setup(db)
    result = FloorPlanExtraction(rooms=[], unreadable=True)
    with patch(AGENT, AsyncMock(return_value=(result, 1, 1))):
        r = extract(api, user, client)
    assert r.status_code == 422


def test_provider_failure_is_a_generic_502(api, db):
    user, client = setup(db)
    with patch(AGENT, AsyncMock(side_effect=RuntimeError("sk-secret boom"))):
        r = extract(api, user, client)
    assert r.status_code == 502
    assert "sk-secret" not in r.text


def test_draft_endpoint_returns_rows_and_saves_nothing(api, db):
    user, client = setup(db)
    r = api.post(
        f"/api/v1/clients/{client.id}/quotation/floor-plan/draft",
        headers=auth(user),
        json={"rooms": [{"name": "Kitchen", "length_ft": 10, "width_ft": 8}]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["line_items"][0]["room"] == "Kitchen"
    assert body["line_items"][0]["qty"] == 45.0
    assert "Kitchen" in body["summary_text"]
