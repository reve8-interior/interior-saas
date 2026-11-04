import uuid

from backend.models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from backend.models.material import MaterialRate
from backend.services.intake import check_row, find_material

from .conftest import auth
from .test_checkpoint_ai_api import add_checkpoint, setup_client, update_items
from .test_design_share import _add_url, _saved_hotspot, studio  # noqa: F401


def item(room="Living Room", description="Sofa", **kw):
    return QuotationLineItem(
        id=uuid.uuid4(),
        room=room,
        description=description,
        unit="nos",
        status=kw.pop("status", QuotationItemStatus.priced),
        **kw,
    )


def test_near_identical_room_name_snaps_to_the_quotations_own():
    check = check_row("living  room", "Sofa", [item(room="Living Room")])
    assert (check.room, check.room_status) == ("Living Room", "existing")


def test_similar_item_in_the_same_room_is_found():
    check = check_row("Living Room", "Sofas", [item()])
    assert check.similar is not None and check.similar.description == "Sofa"


def test_same_item_in_another_room_is_not_a_duplicate():
    check = check_row("Study", "Sofa", [item()])
    assert check.similar is None and check.room_status == "new"


def test_removed_items_are_ignored():
    gone = item(status=QuotationItemStatus.removed)
    assert check_row("Living Room", "Sofa", [gone]).similar is None


def test_generic_label_is_suggested_a_room_but_not_renamed_for_duplicates():
    check = check_row(
        "Bedroom 1",
        "Wardrobe",
        [item(room="Guest Bedroom", description="Wardrobe")],
    )
    assert (check.room, check.room_status) == ("Guest Bedroom", "suggested")
    # Not confirmed by the designer, so no duplicate is claimed in it.
    assert check.similar is None


def test_intake_check_endpoint_reports_room_and_duplicate(api, db):
    user, client = setup_client(db)
    update_items(
        api,
        user,
        client,
        add_checkpoint(db, client, 1),
        [
            {
                "room": "Living Room",
                "description": "Sofa",
                "unit": "nos",
                "qty": 1,
                "rate": 5000,
                "action": "add",
            }
        ],
    )
    r = api.post(
        f"/api/v1/clients/{client.id}/quotation/intake-check",
        headers=auth(user),
        json={"rows": [{"room": "living room", "description": "Sofa"}]},
    )
    assert r.status_code == 200, r.text
    [row] = r.json()["rows"]
    assert row["room"] == "Living Room" and row["room_status"] == "existing"
    assert row["similar"]["description"] == "Sofa"


def test_intake_check_without_a_quotation_is_all_new(api, db):
    user, client = setup_client(db)
    r = api.post(
        f"/api/v1/clients/{client.id}/quotation/intake-check",
        headers=auth(user),
        json={"rows": [{"room": "Hall", "description": "TV unit"}]},
    )
    assert r.json()["rows"][0]["room_status"] == "new"
    assert r.json()["rows"][0]["similar"] is None


def test_hotspot_matching_an_existing_item_is_409_unless_allowed(
    api,
    studio,  # noqa: F811
):
    admin, _, client, mat_a, _ = studio
    design, hs = _saved_hotspot(api, admin, client, mat_a)
    first = api.post(
        _add_url(client, design, hs),
        headers=auth(admin),
        json={"room": "Living Room", "qty": 1},
    )
    assert first.status_code == 201
    design2, hs2 = _saved_hotspot(api, admin, client, mat_a)
    dup = api.post(
        _add_url(client, design2, hs2),
        headers=auth(admin),
        json={"room": "living room", "qty": 1},
    )
    assert dup.status_code == 409
    assert "already in" in dup.json()["detail"]
    ok = api.post(
        _add_url(client, design2, hs2),
        headers=auth(admin),
        json={"room": "living room", "qty": 1, "allow_duplicate": True},
    )
    assert ok.status_code == 201
    rooms = api.get(
        f"/api/v1/clients/{client.id}/quotation", headers=auth(admin)
    ).json()["rooms"]
    # The near-identical room name joined the existing room, not a new one.
    assert [g["room"] for g in rooms] == ["Living Room"]


def _quotation_items(api, admin, client):
    rooms = api.get(
        f"/api/v1/clients/{client.id}/quotation", headers=auth(admin)
    ).json()["rooms"]
    return [i for g in rooms for i in g["items"]]


def test_hotspot_can_update_the_similar_line_instead_of_adding(
    api,
    studio,  # noqa: F811
):
    admin, _, client, mat_a, _ = studio
    design, hs = _saved_hotspot(api, admin, client, mat_a)
    first = api.post(
        _add_url(client, design, hs),
        headers=auth(admin),
        json={"room": "Living Room", "qty": 1, "unit": "nos", "rate": 5000},
    )
    line_id = first.json()["quotation_line_item_id"]

    design2, hs2 = _saved_hotspot(api, admin, client, mat_a)
    r = api.post(
        _add_url(client, design2, hs2),
        headers=auth(admin),
        json={"room": "Living Room", "qty": 2, "update_item_id": line_id},
    )
    assert r.status_code == 201, r.text
    assert r.json()["quotation_line_item_id"] == line_id
    [item] = _quotation_items(api, admin, client)
    assert item["qty"] == 2
    assert item["rate"] == 5000  # blank in the request: left alone
    assert item["initial_price"] == 10000  # re-derived from the new qty


def test_updating_a_line_that_is_gone_is_404(
    api,
    studio,  # noqa: F811
):
    admin, _, client, mat_a, _ = studio
    design, hs = _saved_hotspot(api, admin, client, mat_a)
    api.post(
        _add_url(client, design, hs),
        headers=auth(admin),
        json={"room": "Hall", "qty": 1, "unit": "nos"},
    )
    design2, hs2 = _saved_hotspot(api, admin, client, mat_a)
    r = api.post(
        _add_url(client, design2, hs2),
        headers=auth(admin),
        json={"room": "Hall", "update_item_id": str(uuid.uuid4())},
    )
    assert r.status_code == 404


def material(name, unit="sqft", cost=100):
    return MaterialRate(
        id=uuid.uuid4(), name=name, category="Wood", unit=unit, unit_cost=cost
    )


def test_material_named_in_the_description_is_suggested():
    ply, teak = material("Marine ply", cost=120), material("Teak", cost=900)
    found = find_material("Marine ply wardrobe, 8 ft", [teak, ply])
    assert found is ply


def test_most_specific_material_name_wins():
    ply, marine = material("Ply"), material("Marine ply")
    assert find_material("Marine ply loft", [ply, marine]) is marine


def test_unrelated_description_gets_no_material():
    assert find_material("False ceiling", [material("Marine ply")]) is None


def test_part_of_a_word_is_not_a_material_name():
    assert find_material("Display unit", [material("Ply")]) is None


def test_intake_check_suggests_the_catalogue_material(
    api,
    studio,  # noqa: F811
):
    admin, _, client, mat_a, _ = studio
    r = api.post(
        f"/api/v1/clients/{client.id}/quotation/intake-check",
        headers=auth(admin),
        json={"rows": [{"room": "Hall", "description": "Teak veneer panel"}]},
    )
    assert r.status_code == 200, r.text
    suggested = r.json()["rows"][0]["material"]
    assert suggested["id"] == str(mat_a.id)
    assert (suggested["unit"], suggested["unit_cost"]) == ("sqft", 250.0)
