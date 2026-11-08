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


def test_restore_replaces_live_items_and_keeps_a_backup(api, studio, db):
    admin, _, client, quotation = studio
    v1 = _save(api, admin, client).json()
    quotation.line_items[0].description = "Edited cabinets"
    db.flush()

    res = api.post(
        f"/api/v1/quotation-versions/{v1['id']}/restore", headers=auth(admin)
    )
    assert res.status_code == 200
    body = res.json()
    assert body["restored_number"] == 1
    assert body["items_restored"] == 1
    assert body["backup"]["number"] == 2

    db.expire_all()
    descriptions = [i.description for i in quotation.line_items]
    assert descriptions == ["Modular cabinets"]
    backup = api.get(
        f"/api/v1/quotation-versions/{body['backup']['id']}",
        headers=auth(admin),
    ).json()
    assert backup["line_items"][0]["description"] == "Edited cabinets"


def _public_token(api, admin, client):
    version = _save(api, admin, client).json()
    share = api.post(
        f"/api/v1/quotation-versions/{version['id']}/shares",
        headers=auth(admin),
        json={},
    ).json()
    return version, share, share["url"].rsplit("/", 1)[1]


def test_one_link_follows_the_shared_version_and_resets_the_reply(api, studio):
    admin, _, client, _ = studio
    v1, _, old_token = _public_token(api, admin, client)
    api.post(
        f"/api/v1/quotation-share/{old_token}/respond",
        json={"kind": "question", "name": "Mrs Rao", "message": "Finish?"},
    )

    def listed():
        rows = api.get(
            f"/api/v1/clients/{client.id}/quotation/versions",
            headers=auth(admin),
        ).json()
        return {r["number"]: r for r in rows}

    assert listed()[1]["is_shared"] is True
    assert listed()[1]["reply_kind"] == "question"
    assert listed()[1]["reply_message"] == "Finish?"

    v2, _, new_token = _public_token(api, admin, client)
    rows = listed()
    assert rows[2]["is_shared"] is True
    assert rows[1]["is_shared"] is False
    assert rows[1]["reply_kind"] is None
    # Same URL, now showing version 2, and the old answer is gone.
    assert new_token == old_token
    page = api.get(f"/api/v1/quotation-share/{old_token}")
    assert page.status_code == 200
    assert rows[2]["reply_kind"] is None
    assert page.json().get("responded_kind") is None


def test_new_links_are_readable_and_named_after_the_client(api, studio):
    admin, _, client, _ = studio
    _, _, token = _public_token(api, admin, client)
    slug = client.name.lower().replace(" ", "-")
    assert token.startswith(slug[:10])
    assert len(token.rsplit("-", 1)[1]) == 8
    assert api.get(f"/api/v1/quotation-share/{token}").status_code == 200


def test_public_views_are_counted(api, studio):
    admin, _, client, _ = studio
    version, _, token = _public_token(api, admin, client)

    api.get(f"/api/v1/quotation-share/{token}")
    api.get(f"/api/v1/quotation-share/{token}")

    shares = api.get(
        f"/api/v1/quotation-versions/{version['id']}/shares",
        headers=auth(admin),
    ).json()
    assert shares[0]["view_count"] == 2
    assert shares[0]["last_viewed_at"] is not None


def test_customer_can_approve_or_ask_a_question(api, studio):
    admin, _, client, _ = studio
    version, _, token = _public_token(api, admin, client)
    url = f"/api/v1/quotation-share/{token}/respond"

    assert (
        api.post(url, json={"kind": "question", "name": "Mrs Rao"}).status_code
        == 422
    )

    sent = api.post(
        url,
        json={
            "kind": "question",
            "name": "Mrs Rao",
            "message": "Can we change the finish?",
        },
    )
    assert sent.status_code == 204

    shares = api.get(
        f"/api/v1/quotation-versions/{version['id']}/shares",
        headers=auth(admin),
    ).json()
    assert shares[0]["response_kind"] == "question"
    assert shares[0]["response_message"] == "Can we change the finish?"
    assert (
        api.get(f"/api/v1/quotation-share/{token}").json()["responded_kind"]
        == "question"
    )


def test_responses_are_rate_limited_per_link(api, studio):
    admin, _, client, _ = studio
    _, _, token = _public_token(api, admin, client)
    url = f"/api/v1/quotation-share/{token}/respond"
    body = {"kind": "approved", "name": "Mrs Rao"}

    assert api.post(url, json=body).status_code == 204
    assert api.post(url, json=body).status_code == 429


def test_revoked_link_rejects_responses(api, studio):
    admin, _, client, _ = studio
    version, share, token = _public_token(api, admin, client)
    api.delete(
        f"/api/v1/quotation-versions/{version['id']}/shares/{share['id']}",
        headers=auth(admin),
    )
    res = api.post(
        f"/api/v1/quotation-share/{token}/respond",
        json={"kind": "approved", "name": "Mrs Rao"},
    )
    assert res.status_code == 404


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


def test_share_expiry_can_be_extended(api, studio):
    admin_a, admin_b, client, _ = studio
    version = _save(api, admin_a, client).json()
    base = f"/api/v1/quotation-versions/{version['id']}/shares"
    soon = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    share = api.post(
        base, headers=auth(admin_a), json={"expires_at": soon}
    ).json()
    path = f"{base}/{share['id']}"

    later = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    res = api.patch(path, headers=auth(admin_a), json={"expires_at": later})
    assert res.status_code == 200
    assert res.json()["url"] == share["url"]
    assert res.json()["expires_at"] is not None

    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert (
        api.patch(
            path, headers=auth(admin_a), json={"expires_at": past}
        ).status_code
        == 422
    )
    assert (
        api.patch(path, headers=auth(admin_a), json={}).json()["expires_at"]
        is None
    )
    assert api.patch(path, headers=auth(admin_b), json={}).status_code == 404


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


def test_quotation_lines_name_the_design_they_came_from(api, studio, db):
    admin, _, client, quotation = studio
    design = _design(db, client)
    hotspot = design.hotspots[0] if design.hotspots else None
    if hotspot is None:
        hotspot = db.query(DesignHotspot).filter_by(design_id=design.id).one()
    hotspot.quotation_line_item_id = quotation.line_items[0].id
    db.flush()

    body = api.get(
        f"/api/v1/clients/{client.id}/quotation", headers=auth(admin)
    ).json()
    line = body["rooms"][0]["items"][0]
    assert line["source_design_id"] == str(design.id)
    assert line["source_design_title"] == "Kitchen render"
    assert line["source_hotspot_id"]


def test_line_questions_skip_cooldown_and_keep_the_label(api, studio):
    admin, _, client, _ = studio
    _, _, token = _public_token(api, admin, client)
    url = f"/api/v1/quotation-share/{token}/respond"

    def ask(label: str):
        return api.post(
            url,
            json={
                "kind": "question",
                "name": "Mrs Rao",
                "message": "Which finish?",
                "item_label": label,
            },
        )

    assert ask("Kitchen · Modular cabinet").status_code == 204
    assert ask("Hall · TV unit").status_code == 204
    # A line question never touches the link's own answer or its cooldown.
    assert (
        api.get(f"/api/v1/quotation-share/{token}").json()["responded_kind"]
        is None
    )
    assert (
        api.post(url, json={"kind": "approved", "name": "Mrs Rao"}).status_code
        == 204
    )

    messages = api.get(
        f"/api/v1/clients/{client.id}/quotation/messages",
        headers=auth(admin),
    ).json()
    labels = sorted(m["item_label"] or "" for m in messages)
    assert labels == ["", "Hall · TV unit", "Kitchen · Modular cabinet"]


def test_line_label_needs_a_question(api, studio):
    admin, _, client, _ = studio
    _, _, token = _public_token(api, admin, client)
    res = api.post(
        f"/api/v1/quotation-share/{token}/respond",
        json={"kind": "approved", "name": "Mrs Rao", "item_label": "Hall"},
    )
    assert res.status_code == 422


def _ask_line(api, token, label, text="Which finish?"):
    return api.post(
        f"/api/v1/quotation-share/{token}/respond",
        json={
            "kind": "question",
            "name": "Mrs Rao",
            "message": text,
            "item_label": label,
        },
    )


def test_line_questions_are_capped_per_link_per_hour(api, studio):
    from backend.routers import quotation_versions

    admin, _, client, _ = studio
    _, _, token = _public_token(api, admin, client)
    cap = quotation_versions._LINE_QUESTIONS_PER_HOUR

    for i in range(cap):
        assert _ask_line(api, token, f"Hall · Line {i}").status_code == 204
    assert _ask_line(api, token, "Hall · One too many").status_code == 429


def test_line_cap_does_not_block_the_whole_quotation_answer(api, studio):
    from backend.routers import quotation_versions

    admin, _, client, _ = studio
    _, _, token = _public_token(api, admin, client)
    for i in range(quotation_versions._LINE_QUESTIONS_PER_HOUR):
        _ask_line(api, token, f"Hall · Line {i}")

    res = api.post(
        f"/api/v1/quotation-share/{token}/respond",
        json={"kind": "approved", "name": "Mrs Rao"},
    )
    assert res.status_code == 204


def test_blank_line_label_is_a_whole_quotation_question(api, studio):
    admin, _, client, _ = studio
    _, _, token = _public_token(api, admin, client)
    assert _ask_line(api, token, "   ").status_code == 204

    [message] = api.get(
        f"/api/v1/clients/{client.id}/quotation/messages",
        headers=auth(admin),
    ).json()
    assert message["item_label"] is None
    # It counted as the link's own answer, so the cooldown now applies.
    assert _ask_line(api, token, "").status_code == 429


def test_line_label_is_trimmed_and_length_limited(api, studio):
    admin, _, client, _ = studio
    _, _, token = _public_token(api, admin, client)
    assert _ask_line(api, token, "  Hall · TV unit  ").status_code == 204
    assert _ask_line(api, token, "x" * 301).status_code == 422

    [message] = api.get(
        f"/api/v1/clients/{client.id}/quotation/messages",
        headers=auth(admin),
    ).json()
    assert message["item_label"] == "Hall · TV unit"


def test_line_question_needs_text(api, studio):
    admin, _, client, _ = studio
    _, _, token = _public_token(api, admin, client)
    assert (
        _ask_line(api, token, "Hall · TV unit", text="  ").status_code == 422
    )


def test_line_question_on_a_revoked_link_is_refused(api, studio):
    admin, _, client, _ = studio
    version, share, token = _public_token(api, admin, client)
    api.delete(
        f"/api/v1/quotation-versions/{version['id']}/shares/{share['id']}",
        headers=auth(admin),
    )
    assert _ask_line(api, token, "Hall · TV unit").status_code == 404
