"""The intake gate as each source reaches it over HTTP.

Manual add, meeting add (notes, voice, text and floor plan share it) and
design hotspots must give the same answer for the same row.
"""

import pytest

from .conftest import auth
from .test_checkpoint_ai_api import (
    ITEM,
    add_checkpoint,
    setup_client,
    update_items,
)
from .test_design_share import _add_url, _saved_hotspot, studio  # noqa: F401


def quotation(api, user, client):
    return api.get(
        f"/api/v1/clients/{client.id}/quotation", headers=auth(user)
    ).json()


def seeded(api, db):
    """A client whose quotation has one line: Kitchen — Base cabinets."""
    user, client = setup_client(db)
    update_items(api, user, client, add_checkpoint(db, client, 1))
    return user, client, quotation(api, user, client)


def add_row(api, user, qid, **body):
    payload = {
        "room": "Kitchen",
        "description": "Chimney",
        "unit": "nos",
        **body,
    }
    return api.post(
        f"/api/v1/quotations/{qid}/items", headers=auth(user), json=payload
    )


def rows(api, user, client):
    return [
        (room["room"], i["description"], i["status"])
        for room in quotation(api, user, client)["rooms"]
        for i in room["items"]
    ]


# -- manual add --------------------------------------------------------------


def test_manual_add_of_new_work_is_created(api, db):
    user, client, q = seeded(api, db)
    r = add_row(api, user, q["id"])
    assert r.status_code == 201, r.text
    assert ("Kitchen", "Chimney", "draft") in rows(api, user, client)


def test_manual_add_of_a_similar_line_is_refused_until_confirmed(api, db):
    user, client, q = seeded(api, db)
    refused = add_row(api, user, q["id"], description="Base cabinet")
    assert refused.status_code == 409
    assert "Base cabinets" in refused.json()["detail"]
    assert len(rows(api, user, client)) == 1

    allowed = add_row(
        api, user, q["id"], description="Base cabinet", allow_duplicate=True
    )
    assert allowed.status_code == 201, allowed.text
    assert len(rows(api, user, client)) == 2


def test_manual_add_uses_the_quotations_room_spelling(api, db):
    user, client, q = seeded(api, db)
    add_row(api, user, q["id"], room="  kitchen ")
    assert {room for room, *_ in rows(api, user, client)} == {"Kitchen"}


def test_manual_add_stores_tidy_text(api, db):
    user, client, q = seeded(api, db)
    add_row(api, user, q["id"], room="Study", description="  Desk   top ")
    assert ("Study", "Desk top", "draft") in rows(api, user, client)


@pytest.mark.parametrize(
    "body", [{"room": "   "}, {"description": "   "}, {"description": ""}]
)
def test_manual_add_rejects_blank_room_or_description(api, db, body):
    user, client, q = seeded(api, db)
    r = add_row(api, user, q["id"], **body)
    assert r.status_code == 422
    assert len(rows(api, user, client)) == 1


def test_manual_add_in_another_room_is_not_a_duplicate(api, db):
    user, client, q = seeded(api, db)
    assert (
        add_row(
            api, user, q["id"], room="Pantry", description="Base cabinets"
        ).status_code
        == 201
    )


def test_manual_add_of_a_removed_lines_work_is_not_a_duplicate(api, db):
    user, client, q = seeded(api, db)
    item = q["rooms"][0]["items"][0]
    api.patch(
        f"/api/v1/quotations/{q['id']}/items/{item['id']}",
        headers=auth(user),
        json={"status": "removed"},
    )
    r = add_row(api, user, q["id"], description="Base cabinets")
    assert r.status_code == 201, r.text


def test_manual_add_to_an_unknown_quotation_is_404(api, db):
    user, _, _ = seeded(api, db)
    r = add_row(api, user, "00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


def test_the_allow_flag_is_not_stored_on_the_line(api, db):
    user, client, q = seeded(api, db)
    r = add_row(api, user, q["id"], allow_duplicate=True)
    assert r.status_code == 201
    assert "allow_duplicate" not in r.json()


# -- meeting add (notes, voice, text, floor plan) ----------------------------


def meeting(api, db, user, client, n, items):
    cp = add_checkpoint(db, client, n, items)
    r = update_items(api, user, client, cp, items)
    assert r.status_code == 200, r.text
    return r.json()


def test_meeting_new_row_is_added_under_the_existing_room_spelling(api, db):
    user, client, _ = seeded(api, db)
    body = meeting(
        api,
        db,
        user,
        client,
        2,
        [{**ITEM, "room": "kitchen", "description": "Chimney"}],
    )
    assert body["items_added"] == 1
    assert {room for room, *_ in rows(api, user, client)} == {"Kitchen"}


def test_meeting_repeat_of_a_line_updates_it_instead_of_duplicating(api, db):
    user, client, _ = seeded(api, db)
    body = meeting(
        api,
        db,
        user,
        client,
        2,
        [{**ITEM, "description": "Base cabinet", "rate": 1200}],
    )
    assert (body["items_added"], body["items_updated"]) == (0, 1)
    assert len(rows(api, user, client)) == 1


def test_meeting_remove_marks_the_line_removed(api, db):
    user, client, q = seeded(api, db)
    target = q["rooms"][0]["items"][0]["id"]
    body = meeting(
        api,
        db,
        user,
        client,
        2,
        [{**ITEM, "action": "remove", "target_item_id": target}],
    )
    assert body["items_removed"] == 1
    assert rows(api, user, client)[0][2] == "removed"


def test_meeting_cannot_revive_or_recount_a_removed_line(api, db):
    user, client, q = seeded(api, db)
    target = q["rooms"][0]["items"][0]["id"]
    meeting(
        api,
        db,
        user,
        client,
        2,
        [{**ITEM, "action": "remove", "target_item_id": target}],
    )
    again = meeting(
        api,
        db,
        user,
        client,
        3,
        [
            {**ITEM, "action": "update", "target_item_id": target, "rate": 9},
            {**ITEM, "action": "remove", "target_item_id": target},
        ],
    )
    assert again["items_skipped"] == 2
    assert (again["items_added"], again["items_updated"]) == (0, 0)
    assert again["items_removed"] == 0
    assert rows(api, user, client)[0][2] == "removed"


def test_meeting_row_for_a_deleted_line_is_skipped_not_guessed(api, db):
    user, client, _ = seeded(api, db)
    body = meeting(
        api,
        db,
        user,
        client,
        2,
        [
            {
                **ITEM,
                "room": "Hall",
                "description": "Mandir",
                "action": "update",
                "target_item_id": "00000000-0000-0000-0000-000000000000",
            }
        ],
    )
    assert body["items_skipped"] == 1 and body["items_added"] == 0


def test_meeting_with_a_blank_row_still_applies_the_rest(api, db):
    user, client, _ = seeded(api, db)
    cp = add_checkpoint(db, client, 2, [])
    r = api.post(
        f"/api/v1/clients/{client.id}/quotation/update-items",
        headers=auth(user),
        json={
            "checkpoint_id": str(cp.id),
            "line_items": [
                {**ITEM, "room": "Hall", "description": "Mandir"},
            ],
        },
    )
    assert r.status_code == 200 and r.json()["items_added"] == 1


def test_applying_the_same_meeting_twice_changes_nothing_the_second_time(
    api, db
):
    user, client, _ = seeded(api, db)
    items = [{**ITEM, "room": "Hall", "description": "Mandir"}]
    cp = add_checkpoint(db, client, 2, items)
    update_items(api, user, client, cp, items)
    first = rows(api, user, client)
    update_items(api, user, client, cp, items)
    assert rows(api, user, client) == first


# -- design hotspot ----------------------------------------------------------


def test_hotspot_goes_through_the_same_duplicate_gate(
    api,
    studio,  # noqa: F811
):
    admin, _, client, mat_a, _ = studio
    design, hs = _saved_hotspot(api, admin, client, mat_a)
    first = api.post(
        _add_url(client, design, hs),
        headers=auth(admin),
        json={"room": "Hall", "unit": "sqft"},
    )
    assert first.status_code in (200, 201), first.text
    design2, hs2 = _saved_hotspot(api, admin, client, mat_a)
    second = api.post(
        _add_url(client, design2, hs2),
        headers=auth(admin),
        json={"room": "hall", "unit": "sqft"},
    )
    assert second.status_code == 409
    forced = api.post(
        _add_url(client, design2, hs2),
        headers=auth(admin),
        json={"room": "hall", "unit": "sqft", "allow_duplicate": True},
    )
    assert forced.status_code in (200, 201), forced.text
    rooms = {
        r["room"]
        for r in api.get(
            f"/api/v1/clients/{client.id}/quotation", headers=auth(admin)
        ).json()["rooms"]
    }
    assert rooms == {"Hall"}  # "hall" snapped to the existing spelling


def test_hotspot_with_a_blank_room_is_rejected(
    api,
    studio,  # noqa: F811
):
    admin, _, client, mat_a, _ = studio
    design, hs = _saved_hotspot(api, admin, client, mat_a)
    r = api.post(
        _add_url(client, design, hs),
        headers=auth(admin),
        json={"room": "   ", "unit": "sqft"},
    )
    assert r.status_code in (409, 422), r.text
    assert r.status_code == 422


# -- editing a line's room or wording ----------------------------------------


def patch(api, user, qid, item_id, **body):
    return api.patch(
        f"/api/v1/quotations/{qid}/items/{item_id}",
        headers=auth(user),
        json=body,
    )


def two_lines(api, db):
    user, client, q = seeded(api, db)
    assert (
        add_row(api, user, q["id"], description="Chimney").status_code == 201
    )
    q = quotation(api, user, client)
    by_name = {i["description"]: i for i in q["rooms"][0]["items"]}
    return user, client, q["id"], by_name


def test_renaming_a_line_into_a_duplicate_is_refused_until_confirmed(api, db):
    user, client, qid, lines = two_lines(api, db)
    chimney = lines["Chimney"]
    refused = patch(api, user, qid, chimney["id"], description="Base cabinet")
    assert refused.status_code == 409
    assert "Base cabinets" in refused.json()["detail"]
    assert ("Kitchen", "Chimney", "draft") in rows(api, user, client)

    allowed = patch(
        api,
        user,
        qid,
        chimney["id"],
        description="Base cabinet",
        allow_duplicate=True,
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["description"] == "Base cabinet"


def test_moving_a_line_into_a_room_that_has_its_twin_is_refused(api, db):
    user, client, q = seeded(api, db)
    add_row(api, user, q["id"], room="Pantry", description="Base cabinets")
    pantry = [
        i
        for room in quotation(api, user, client)["rooms"]
        for i in room["items"]
        if i["description"] == "Base cabinets" and room["room"] == "Pantry"
    ][0]
    r = patch(api, user, q["id"], pantry["id"], room="kitchen")
    assert r.status_code == 409


def test_an_unrelated_edit_is_never_blocked_by_a_look_alike(api, db):
    user, client, q = seeded(api, db)
    add_row(
        api, user, q["id"], description="Base cabinet", allow_duplicate=True
    )
    lines = quotation(api, user, client)["rooms"][0]["items"]
    r = patch(api, user, q["id"], lines[0]["id"], remarks="checked on site")
    assert r.status_code == 200, r.text


def test_resaving_the_same_wording_is_not_a_rename(api, db):
    user, client, q = seeded(api, db)
    add_row(
        api, user, q["id"], description="Base cabinet", allow_duplicate=True
    )
    first = quotation(api, user, client)["rooms"][0]["items"][0]
    r = patch(
        api, user, q["id"], first["id"], description=first["description"]
    )
    assert r.status_code == 200, r.text


def test_renaming_snaps_the_room_and_tidies_the_wording(api, db):
    user, client, q = seeded(api, db)
    item = q["rooms"][0]["items"][0]
    r = patch(
        api,
        user,
        q["id"],
        item["id"],
        room=" kitchen ",
        description="  Tall   units ",
    )
    assert r.status_code == 200, r.text
    assert (r.json()["room"], r.json()["description"]) == (
        "Kitchen",
        "Tall units",
    )


def test_renaming_to_blank_text_is_rejected(api, db):
    user, client, q = seeded(api, db)
    item = q["rooms"][0]["items"][0]
    assert patch(api, user, q["id"], item["id"], room="   ").status_code == 422
    assert (
        patch(api, user, q["id"], item["id"], description="  ").status_code
        == 422
    )


def test_renaming_into_a_new_room_is_fine(api, db):
    user, client, q = seeded(api, db)
    item = q["rooms"][0]["items"][0]
    r = patch(api, user, q["id"], item["id"], room="Utility")
    assert r.status_code == 200 and r.json()["room"] == "Utility"


# -- an approved quotation is frozen -----------------------------------------


def approved(api, db):
    user, client, q = seeded(api, db)
    r = api.post(
        f"/api/v1/clients/{client.id}/quotation/approve", headers=auth(user)
    )
    assert r.status_code == 200, r.text
    return user, client, quotation(api, user, client)


def test_approved_quotation_refuses_a_hand_added_line(api, db):
    user, client, q = approved(api, db)
    r = add_row(api, user, q["id"])
    assert r.status_code == 409 and "Reopen" in r.json()["detail"]
    assert len(rows(api, user, client)) == 1


def test_approved_quotation_refuses_edits_and_deletes(api, db):
    user, client, q = approved(api, db)
    item = q["rooms"][0]["items"][0]
    assert (
        patch(api, user, q["id"], item["id"], remarks="x").status_code == 409
    )
    gone = api.delete(
        f"/api/v1/quotations/{q['id']}/items/{item['id']}",
        headers=auth(user),
    )
    assert gone.status_code == 409
    assert len(rows(api, user, client)) == 1


def test_approved_quotation_refuses_a_meeting(api, db):
    user, client, _ = approved(api, db)
    cp = add_checkpoint(db, client, 2, [{**ITEM, "description": "Hob"}])
    r = update_items(api, user, client, cp, [{**ITEM, "description": "Hob"}])
    assert r.status_code == 409
    assert len(rows(api, user, client)) == 1


def test_approved_quotation_refuses_undoing_a_meeting(api, db):
    user, client, _ = approved(api, db)
    # The meeting that built the quotation cannot be taken back out either.
    from backend.models.checkpoint import Checkpoint

    cp = db.query(Checkpoint).filter_by(client_id=client.id).first()
    r = api.post(
        f"/api/v1/clients/{client.id}/quotation/remove-checkpoint/{cp.id}",
        headers=auth(user),
    )
    assert r.status_code == 409 and "Reopen" in r.json()["detail"]


def test_reopening_lets_the_quotation_change_again(api, db):
    user, client, q = approved(api, db)
    r = api.post(
        f"/api/v1/clients/{client.id}/quotation/reopen", headers=auth(user)
    )
    assert r.status_code == 200 and r.json()["status"] == "pending"
    assert add_row(api, user, q["id"]).status_code == 201


def test_reopening_an_unapproved_quotation_is_a_409(api, db):
    user, client, _ = seeded(api, db)
    r = api.post(
        f"/api/v1/clients/{client.id}/quotation/reopen", headers=auth(user)
    )
    assert r.status_code == 409


def test_reopening_without_a_quotation_is_a_404(api, db):
    user, client = setup_client(db)
    r = api.post(
        f"/api/v1/clients/{client.id}/quotation/reopen", headers=auth(user)
    )
    assert r.status_code == 404


def test_reopening_is_recorded_in_the_audit_log(api, db):
    from backend.models.audit import AuditLog

    user, client, q = approved(api, db)
    api.post(
        f"/api/v1/clients/{client.id}/quotation/reopen", headers=auth(user)
    )
    actions = {a.action for a in db.query(AuditLog).all()}
    assert "quotation_reopened" in actions


def test_approved_quotation_refuses_a_hotspot(
    api,
    studio,  # noqa: F811
):
    admin, _, client, mat_a, _ = studio
    design, hs = _saved_hotspot(api, admin, client, mat_a)
    api.post(
        _add_url(client, design, hs),
        headers=auth(admin),
        json={"room": "Hall", "unit": "sqft"},
    )
    assert (
        api.post(
            f"/api/v1/clients/{client.id}/quotation/approve",
            headers=auth(admin),
        ).status_code
        == 200
    )
    design2, hs2 = _saved_hotspot(api, admin, client, mat_a)
    r = api.post(
        _add_url(client, design2, hs2),
        headers=auth(admin),
        json={"room": "Study", "unit": "sqft"},
    )
    assert r.status_code == 409 and "Reopen" in r.json()["detail"]


# -- bringing a removed line back, and restoring a version -------------------


def remove(api, user, qid, item):
    return patch(api, user, qid, item["id"], status="removed")


def test_reviving_a_removed_line_is_refused_when_its_twin_is_live(api, db):
    user, client, q = seeded(api, db)
    old = q["rooms"][0]["items"][0]
    assert remove(api, user, q["id"], old).status_code == 200
    assert (
        add_row(api, user, q["id"], description="Base cabinets").status_code
        == 201
    )

    revive = patch(api, user, q["id"], old["id"], status="draft")
    assert revive.status_code == 409
    assert "Base cabinets" in revive.json()["detail"]

    forced = patch(
        api, user, q["id"], old["id"], status="draft", allow_duplicate=True
    )
    assert forced.status_code == 200, forced.text


def test_reviving_a_removed_line_with_no_twin_is_fine(api, db):
    user, client, q = seeded(api, db)
    old = q["rooms"][0]["items"][0]
    remove(api, user, q["id"], old)
    assert (
        patch(api, user, q["id"], old["id"], status="draft").status_code == 200
    )


def test_setting_a_live_line_to_another_live_status_is_not_checked(api, db):
    user, client, q = seeded(api, db)
    add_row(
        api, user, q["id"], description="Base cabinet", allow_duplicate=True
    )
    first = quotation(api, user, client)["rooms"][0]["items"][0]
    r = patch(api, user, q["id"], first["id"], status="agreed")
    assert r.status_code in (200, 400, 422)
    assert r.status_code != 409


def saved_version(api, user, client):
    r = api.post(
        f"/api/v1/clients/{client.id}/quotation/versions",
        headers=auth(user),
        json={"label": "v"},
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def test_restoring_a_version_replaces_the_live_lines(api, db):
    user, client, q = seeded(api, db)
    version = saved_version(api, user, client)
    add_row(api, user, q["id"], description="Chimney")
    assert len(rows(api, user, client)) == 2
    db.expire_all()  # each real request starts with a fresh session
    r = api.post(
        f"/api/v1/quotation-versions/{version}/restore", headers=auth(user)
    )
    assert r.status_code == 200, r.text
    assert [d for _, d, _ in rows(api, user, client)] == ["Base cabinets"]


def test_restoring_a_version_is_refused_while_approved(api, db):
    user, client, q = seeded(api, db)
    version = saved_version(api, user, client)
    api.post(
        f"/api/v1/clients/{client.id}/quotation/approve", headers=auth(user)
    )
    r = api.post(
        f"/api/v1/quotation-versions/{version}/restore", headers=auth(user)
    )
    assert r.status_code == 409 and "Reopen" in r.json()["detail"]
    assert len(rows(api, user, client)) == 1


def test_restoring_after_reopening_works(api, db):
    user, client, q = seeded(api, db)
    version = saved_version(api, user, client)
    api.post(
        f"/api/v1/clients/{client.id}/quotation/approve", headers=auth(user)
    )
    api.post(
        f"/api/v1/clients/{client.id}/quotation/reopen", headers=auth(user)
    )
    r = api.post(
        f"/api/v1/quotation-versions/{version}/restore", headers=auth(user)
    )
    assert r.status_code == 200, r.text
