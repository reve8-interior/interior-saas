"""Quotation versions and their public, price-toggled share links."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from backend.models.design import Design, DesignHotspot, DesignSource
from backend.models.quotation import Quotation
from backend.models.quotation_line_item import QuotationLineItem
from backend.models.user import UserRole

from .conftest import (
    as_business,
    as_owner,
    auth,
    make_business,
    make_client_row,
    make_user,
)


@pytest.fixture
def studio(db):
    """Two businesses; business A has an admin and a client with a quote."""
    a, b = make_business(db, "Alpha Interiors"), make_business(db, "Beta")
    admin_a = make_user(db, role=UserRole.admin, business=a)
    admin_b = make_user(db, role=UserRole.admin, business=b)
    as_business(db, a.id)
    client = make_client_row(db, "Mrs Rao")
    quotation = Quotation(client_id=client.id)
    db.add(quotation)
    db.flush()
    db.add(
        QuotationLineItem(
            quotation_id=quotation.id,
            room="Kitchen",
            description="Modular cabinets",
            unit="sqft",
            qty=10,
            rate=1000,
            initial_price=10000,
            remarks="client is price sensitive",
            extra={"margin": 40},
        )
    )
    as_owner(db)
    db.flush()
    return admin_a, admin_b, client, quotation


def _save(api, admin, client, label=None):
    return api.post(
        f"/api/v1/clients/{client.id}/quotation/versions",
        headers=auth(admin),
        json={"label": label},
    )


def test_versions_are_numbered_and_frozen(api, studio, db):
    admin, _, client, quotation = studio
    v1 = _save(api, admin, client, "First draft")
    assert v1.status_code == 201
    assert v1.json()["number"] == 1

    item = quotation.line_items[0]
    item.initial_price = 12000
    db.flush()
    v2 = _save(api, admin, client)
    assert v2.json()["number"] == 2

    listed = api.get(
        f"/api/v1/clients/{client.id}/quotation/versions", headers=auth(admin)
    ).json()
    assert [v["number"] for v in listed] == [2, 1]
    assert listed[1]["initial_total"] == 10000
    assert listed[0]["initial_total"] == 12000

    detail = api.get(
        f"/api/v1/quotation-versions/{v1.json()['id']}", headers=auth(admin)
    ).json()
    assert detail["line_items"][0]["initial_price"] == 10000


def test_empty_quotation_cannot_be_versioned(api, studio):
    admin, _, client, quotation = studio
    for item in list(quotation.line_items):
        quotation.line_items.remove(item)
    assert _save(api, admin, client).status_code == 400


def test_public_share_hides_prices_and_internals(api, studio):
    admin, _, client, _ = studio
    version = _save(api, admin, client, "Round 1").json()
    base = f"/api/v1/quotation-versions/{version['id']}/shares"

    share = api.post(base, headers=auth(admin), json={"show_prices": False})
    assert share.status_code == 201
    token = share.json()["url"].rsplit("/", 1)[1]

    body = api.get(f"/api/v1/quotation-share/{token}").json()
    assert body["label"] == "Round 1"
    assert body["total"] is None
    item = body["rooms"][0]["items"][0]
    assert item["description"] == "Modular cabinets"
    assert item["rate"] is None and item["amount"] is None
    raw = str(body)
    assert "price sensitive" not in raw
    assert "margin" not in raw

    priced = api.post(base, headers=auth(admin), json={"show_prices": True})
    token = priced.json()["url"].rsplit("/", 1)[1]
    body = api.get(f"/api/v1/quotation-share/{token}").json()
    assert body["total"] == 10000
    assert body["rooms"][0]["items"][0]["amount"] == 10000


def test_share_expiry_and_revoke(api, studio):
    admin, _, client, _ = studio
    version = _save(api, admin, client).json()
    base = f"/api/v1/quotation-versions/{version['id']}/shares"

    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert (
        api.post(
            base, headers=auth(admin), json={"expires_at": past}
        ).status_code
        == 422
    )

    share = api.post(base, headers=auth(admin), json={}).json()
    token = share["url"].rsplit("/", 1)[1]
    assert api.get(f"/api/v1/quotation-share/{token}").status_code == 200
    assert (
        api.delete(f"{base}/{share['id']}", headers=auth(admin)).status_code
        == 204
    )
    assert api.get(f"/api/v1/quotation-share/{token}").status_code == 404
    # A stopped link is deleted, not kept in the list.
    assert api.get(base, headers=auth(admin)).json() == []


def test_other_business_cannot_touch_versions(api, studio):
    admin_a, admin_b, client, _ = studio
    version = _save(api, admin_a, client).json()
    path = f"/api/v1/quotation-versions/{version['id']}"
    assert api.get(path, headers=auth(admin_b)).status_code == 404
    assert (
        api.post(f"{path}/shares", headers=auth(admin_b), json={}).status_code
        == 404
    )
    assert _save(api, admin_b, client).status_code == 404


def _design(db, client, **kw):
    as_business(db, client.business_id)
    design = Design(
        client_id=client.id,
        source=DesignSource.designer_uploaded,
        title="Kitchen render",
        image_url="https://img.example/kitchen.png",
        **kw,
    )
    db.add(design)
    db.flush()
    db.add(
        DesignHotspot(
            design_id=design.id,
            label="Island",
            x=0.1,
            y=0.1,
            labour_cost=500,
        )
    )
    as_owner(db)
    db.flush()
    return design


def _public_room(api, version_id, admin):
    share = api.post(
        f"/api/v1/quotation-versions/{version_id}/shares",
        headers=auth(admin),
        json={},
    )
    token = share.json()["url"].rsplit("/", 1)[1]
    return api.get(f"/api/v1/quotation-share/{token}").json()["rooms"][0]


def test_designs_chosen_at_save_show_in_public_view(api, studio, db):
    admin, _, client, _ = studio
    design = _design(db, client)
    url = f"/api/v1/clients/{client.id}/quotation/versions"

    unknown = api.post(
        url, headers=auth(admin), json={"room_designs": {"Attic": []}}
    )
    assert unknown.status_code == 422
    foreign = api.post(
        url,
        headers=auth(admin),
        json={"room_designs": {"Kitchen": [str(uuid.uuid4())]}},
    )
    assert foreign.status_code == 404

    saved = api.post(
        url,
        headers=auth(admin),
        json={"room_designs": {"Kitchen": [str(design.id)]}},
    )
    assert saved.status_code == 201
    room = _public_room(api, saved.json()["id"], admin)
    assert room["designs"][0]["image_url"] == "https://img.example/kitchen.png"
    hotspot = room["designs"][0]["hotspots"][0]
    assert hotspot["label"] == "Island"
    assert hotspot["labour_cost"] is None


def test_design_room_tags_prefill_new_versions(api, studio, db):
    admin, _, client, _ = studio
    design = _design(db, client)
    tag = api.put(
        f"/api/v1/clients/{client.id}/designs/{design.id}/rooms",
        headers=auth(admin),
        json={"rooms": ["kitchen", "Hall"]},
    )
    assert tag.status_code == 200
    assert tag.json()["rooms"] == ["kitchen", "Hall"]

    # No explicit choice: tags are matched to the quotation's room names.
    saved = _save(api, admin, client).json()
    assert saved["room_designs"] == {"Kitchen": [str(design.id)]}


def test_version_designs_can_be_changed_later(api, studio, db):
    admin, admin_b, client, _ = studio
    design = _design(db, client)
    version = _save(api, admin, client).json()
    assert version["room_designs"] == {}
    path = f"/api/v1/quotation-versions/{version['id']}/designs"

    body = {"room_designs": {"Kitchen": [str(design.id)]}}
    assert api.put(path, headers=auth(admin_b), json=body).status_code == 404
    done = api.put(path, headers=auth(admin), json=body)
    assert done.status_code == 200
    assert _public_room(api, version["id"], admin)["designs"]
    cleared = api.put(path, headers=auth(admin), json={"room_designs": {}})
    assert cleared.json()["room_designs"] == {}


def _xlsx(rows: list[list]) -> bytes:
    from io import BytesIO

    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Quotation"
    ws.append(
        ["Room", "Description", "Unit", "Qty", "Initial Price", "Status"]
    )
    for row in rows:
        ws.append(row)
    out = BytesIO()
    wb.save(out)
    return out.getvalue()


def _import(api, admin, client, data: bytes, label="Edited"):
    return api.post(
        f"/api/v1/clients/{client.id}/quotation/versions/import",
        headers=auth(admin),
        files={"file": ("q.xlsx", data, "application/octet-stream")},
        data={"label": label},
    )


def test_import_creates_next_version_from_edited_sheet(api, studio):
    admin_a, _, client, _ = studio
    assert _save(api, admin_a, client).status_code == 201
    res = _import(
        api,
        admin_a,
        client,
        _xlsx(
            [
                ["Kitchen", "Cabinets", "sqft", 10, "₹12,000", "Agreed"],
                ["Hall", "TV unit", "nos", 1, 5000, None],
            ]
        ),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert (body["number"], body["label"], body["item_count"]) == (
        2,
        "Edited",
        2,
    )
    assert body["initial_total"] == 17000


def test_import_rejects_bad_files(api, studio):
    admin_a, _, client, _ = studio
    assert _import(api, admin_a, client, b"nope").status_code == 422
    bad_number = _xlsx([["Kitchen", "Cabinets", "sqft", "abc", 1, None]])
    assert _import(api, admin_a, client, bad_number).status_code == 422
    assert _import(api, admin_a, client, _xlsx([])).status_code == 422


def test_inactive_version_cannot_be_shared_or_viewed(api, studio):
    admin_a, _, client, _ = studio
    version = _save(api, admin_a, client).json()
    share = api.post(
        f"/api/v1/quotation-versions/{version['id']}/shares",
        headers=auth(admin_a),
        json={"show_prices": False},
    ).json()
    token = share["url"].rsplit("/", 1)[-1]
    off = api.patch(
        f"/api/v1/quotation-versions/{version['id']}/active",
        headers=auth(admin_a),
        json={"is_active": False},
    )
    assert off.status_code == 200 and off.json()["is_active"] is False
    assert api.get(f"/api/v1/quotation-share/{token}").status_code == 404
    blocked = api.post(
        f"/api/v1/quotation-versions/{version['id']}/shares",
        headers=auth(admin_a),
        json={"show_prices": False},
    )
    assert blocked.status_code == 409
    api.patch(
        f"/api/v1/quotation-versions/{version['id']}/active",
        headers=auth(admin_a),
        json={"is_active": True},
    )
    assert api.get(f"/api/v1/quotation-share/{token}").status_code == 200


def _agree(api, admin, version_id, method="put"):
    return getattr(api, method)(
        f"/api/v1/quotation-versions/{version_id}/agree", headers=auth(admin)
    )


def test_picking_a_version_moves_client_to_implementation(api, studio, db):
    admin_a, _, client, _ = studio
    first = _save(api, admin_a, client).json()
    second = _save(api, admin_a, client).json()

    picked = _agree(api, admin_a, first["id"])
    assert picked.status_code == 200 and picked.json()["is_agreed"] is True
    db.refresh(client)
    assert client.current_phase == "implementation"

    # Picking another version replaces the first pick.
    assert _agree(api, admin_a, second["id"]).status_code == 200
    listed = api.get(
        f"/api/v1/clients/{client.id}/quotation/versions",
        headers=auth(admin_a),
    ).json()
    assert {v["number"]: v["is_agreed"] for v in listed} == {1: False, 2: True}


def test_agreed_version_cannot_be_deactivated_and_shows_in_share(api, studio):
    admin_a, _, client, _ = studio
    version = _save(api, admin_a, client).json()
    _agree(api, admin_a, version["id"])
    off = api.patch(
        f"/api/v1/quotation-versions/{version['id']}/active",
        headers=auth(admin_a),
        json={"is_active": False},
    )
    assert off.status_code == 409

    share = api.post(
        f"/api/v1/quotation-versions/{version['id']}/shares",
        headers=auth(admin_a),
        json={"show_prices": False},
    ).json()
    token = share["url"].rsplit("/", 1)[-1]
    assert api.get(f"/api/v1/quotation-share/{token}").json()["is_agreed"]

    undone = _agree(api, admin_a, version["id"], method="delete")
    assert undone.status_code == 200 and undone.json()["is_agreed"] is False


def test_inactive_version_cannot_be_picked(api, studio):
    admin_a, _, client, _ = studio
    version = _save(api, admin_a, client).json()
    api.patch(
        f"/api/v1/quotation-versions/{version['id']}/active",
        headers=auth(admin_a),
        json={"is_active": False},
    )
    assert _agree(api, admin_a, version["id"]).status_code == 409
