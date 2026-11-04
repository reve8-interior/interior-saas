"""Two people on one quotation: stale edits and undo that would lose edits."""

from datetime import timedelta

from backend.models.user import UserRole

from .conftest import auth, make_user
from .test_checkpoint_ai_api import add_checkpoint, setup_client, update_items


def quotation_with_item(api, db):
    user, client = setup_client(db)
    cp = add_checkpoint(db, client, 1)
    update_items(api, user, client, cp)
    q = api.get(
        f"/api/v1/clients/{client.id}/quotation", headers=auth(user)
    ).json()
    item = q["rooms"][0]["items"][0]
    return user, client, cp, q["id"], item


def patch(api, user, qid, item, body):
    return api.patch(
        f"/api/v1/quotations/{qid}/items/{item['id']}",
        headers=auth(user),
        json=body,
    )


def test_edit_with_current_timestamp_succeeds(api, db):
    user, _, _, qid, item = quotation_with_item(api, db)
    r = patch(
        api,
        user,
        qid,
        item,
        {"remarks": "ok", "expected_updated_at": item["updated_at"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["remarks"] == "ok"


def test_edit_without_a_timestamp_still_works(api, db):
    user, _, _, qid, item = quotation_with_item(api, db)
    assert patch(api, user, qid, item, {"remarks": "x"}).status_code == 200


def test_stale_edit_is_409_and_names_the_other_editor(api, db):
    user, client, _, qid, item = quotation_with_item(api, db)
    colleague = make_user(
        db,
        role=UserRole.admin,
        business=user.business,
        email="priya@example.com",
        full_name="Priya",
    )
    first = patch(
        api,
        colleague,
        qid,
        item,
        {"remarks": "priya", "expected_updated_at": item["updated_at"]},
    )
    assert first.status_code == 200, first.text
    stale = patch(
        api,
        user,
        qid,
        item,
        {"remarks": "mine", "expected_updated_at": item["updated_at"]},
    )
    assert stale.status_code == 409
    assert "Priya" in stale.json()["detail"]
    fresh = api.get(
        f"/api/v1/clients/{client.id}/quotation", headers=auth(user)
    ).json()["rooms"][0]["items"][0]
    assert fresh["remarks"] == "priya"


def test_quotation_shows_who_last_edited_a_line(api, db):
    user, client, _, qid, item = quotation_with_item(api, db)
    colleague = make_user(
        db,
        role=UserRole.admin,
        business=user.business,
        email="priya@example.com",
        full_name="Priya",
    )
    assert (
        patch(api, colleague, qid, item, {"remarks": "p"}).status_code == 200
    )
    line = api.get(
        f"/api/v1/clients/{client.id}/quotation", headers=auth(user)
    ).json()["rooms"][0]["items"][0]
    assert line["edited_by"] == "Priya"


def test_stale_delete_is_409(api, db):
    user, _, _, qid, item = quotation_with_item(api, db)
    patch(api, user, qid, item, {"remarks": "changed"})
    r = api.delete(
        f"/api/v1/quotations/{qid}/items/{item['id']}",
        headers=auth(user),
        params={"expected_updated_at": item["updated_at"]},
    )
    assert r.status_code == 409


def remove(api, user, client, cp, **params):
    return api.post(
        f"/api/v1/clients/{client.id}/quotation/remove-checkpoint/{cp.id}",
        headers=auth(user),
        params=params,
    )


def test_undo_is_refused_after_hand_edits_unless_forced(api, db):
    user, client, cp, qid, item = quotation_with_item(api, db)
    db.refresh(cp)
    cp.applied_at = cp.applied_at - timedelta(minutes=5)
    db.flush()
    patch(api, user, qid, item, {"remarks": "hand edit"})

    refused = remove(api, user, client, cp)
    assert refused.status_code == 409
    assert "edited by hand" in refused.json()["detail"]

    forced = remove(api, user, client, cp, force="true")
    assert forced.status_code == 200, forced.text


def test_undo_without_hand_edits_needs_no_force(api, db):
    user, client, cp, _, _ = quotation_with_item(api, db)
    assert remove(api, user, client, cp).status_code == 200
