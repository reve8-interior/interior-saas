"""Characterization tests for the checkpoint to quotation endpoints."""

import uuid
from datetime import datetime, timedelta, timezone

from backend.models.checkpoint import Checkpoint, CheckpointSource
from backend.models.quotation import Quotation
from backend.models.user import UserRole

from .conftest import (
    as_business,
    auth,
    make_business,
    make_client_row,
    make_user,
)

BASE = datetime(2030, 1, 1, tzinfo=timezone.utc)

ITEM = {
    "room": "Kitchen",
    "description": "Base cabinets",
    "unit": "sqft",
    "raw_dimension": "10x2",
    "qty": 20,
    "rate": 1000,
    "action": "add",
}


def setup_client(db):
    user = make_user(db, role=UserRole.admin, business=make_business(db))
    as_business(db, user.business_id)
    return user, make_client_row(db, "C")


def add_checkpoint(db, client, n: int, items: list[dict] | None = None):
    """Checkpoint n minutes after BASE.

    Explicit times keep ordering stable: now() is constant inside the
    per-test transaction, so server defaults would tie.
    """
    cp = Checkpoint(
        client_id=client.id,
        summary_text=f"meeting {n}",
        structured_diff={"line_items": items if items is not None else [ITEM]},
        source=CheckpointSource.ai_extract,
        created_at=BASE + timedelta(minutes=n),
    )
    db.add(cp)
    db.flush()
    return cp


def update_items(api, user, client, cp, items=None):
    return api.post(
        f"/api/v1/clients/{client.id}/quotation/update-items",
        headers=auth(user),
        json={
            "checkpoint_id": str(cp.id),
            "line_items": items if items is not None else [ITEM],
        },
    )


class TestUpdateItems:
    def test_first_checkpoint_creates_quotation(self, api, db):
        user, client = setup_client(db)
        cp = add_checkpoint(db, client, 1)
        r = update_items(api, user, client, cp)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["action"] == "created"
        assert body["items_added"] == 1
        db.refresh(cp)
        assert cp.added_to_quotation is True

    def test_second_checkpoint_updates_same_quotation(self, api, db):
        user, client = setup_client(db)
        sofa = {**ITEM, "room": "Hall", "description": "Sofa"}
        first = add_checkpoint(db, client, 1)
        second = add_checkpoint(db, client, 2, [sofa])
        q1 = update_items(api, user, client, first).json()["quotation_id"]
        r = update_items(api, user, client, second, [sofa])
        assert r.json()["action"] == "updated"
        assert r.json()["quotation_id"] == q1

    def test_meetings_can_be_added_in_any_order_and_are_recorded(
        self, api, db
    ):
        user, client = setup_client(db)
        add_checkpoint(db, client, 1)
        newer = add_checkpoint(db, client, 2)
        r = update_items(api, user, client, newer)
        assert r.status_code == 200, r.text
        db.refresh(newer)
        assert newer.applied_at is not None
        assert newer.applied_by_id == user.id
        listed = api.get(
            f"/api/v1/clients/{client.id}/checkpoints", headers=auth(user)
        ).json()
        added = next(c for c in listed if c["id"] == str(newer.id))
        assert added["applied_by_name"] == (user.full_name or user.email)

    def test_row_for_a_deleted_item_is_skipped_not_guessed(self, api, db):
        user, client = setup_client(db)
        cp = add_checkpoint(db, client, 1)
        stale = {
            **ITEM,
            "action": "update",
            "target_item_id": str(uuid.uuid4()),
        }
        r = update_items(api, user, client, cp, [stale])
        assert r.status_code == 200, r.text
        assert r.json()["items_skipped"] == 1
        assert r.json()["items_added"] == 0

    def test_older_checkpoint_without_items_does_not_block(self, api, db):
        user, client = setup_client(db)
        add_checkpoint(db, client, 1, items=[])
        newer = add_checkpoint(db, client, 2)
        assert update_items(api, user, client, newer).status_code == 200

    def test_missing_mandatory_column_is_422(self, api, db):
        user, client = setup_client(db)
        cp = add_checkpoint(db, client, 1)
        r = update_items(api, user, client, cp, [{**ITEM, "room": " "}])
        assert r.status_code == 422
        assert "mandatory" in r.json()["detail"]

    def test_unknown_checkpoint_is_404(self, api, db):
        user, client = setup_client(db)
        ghost = Checkpoint(id=uuid.uuid4())
        assert update_items(api, user, client, ghost).status_code == 404


class TestRemoveCheckpoint:
    def _remove(self, api, user, client, cp):
        return api.post(
            f"/api/v1/clients/{client.id}/quotation/remove-checkpoint/{cp.id}",
            headers=auth(user),
        )

    def test_removing_restores_prior_state_and_flag(self, api, db):
        user, client = setup_client(db)
        cp = add_checkpoint(db, client, 1)
        update_items(api, user, client, cp)
        r = self._remove(api, user, client, cp)
        assert r.status_code == 200, r.text
        db.refresh(cp)
        assert cp.added_to_quotation is False
        quotation = db.query(Quotation).filter_by(client_id=client.id).one()
        db.refresh(quotation)
        assert quotation.checkpoint_id is None
        assert quotation.line_items == []

    def test_not_on_quotation_is_409(self, api, db):
        user, client = setup_client(db)
        cp = add_checkpoint(db, client, 1)
        assert self._remove(api, user, client, cp).status_code == 409

    def test_newer_checkpoint_must_go_first(self, api, db):
        user, client = setup_client(db)
        first = add_checkpoint(db, client, 1)
        second = add_checkpoint(db, client, 2)
        update_items(api, user, client, first)
        update_items(api, user, client, second)
        r = self._remove(api, user, client, first)
        assert r.status_code == 409
        assert "added after" in r.json()["detail"]
        assert self._remove(api, user, client, second).status_code == 200
        assert self._remove(api, user, client, first).status_code == 200

    def test_undo_follows_the_order_meetings_were_added(self, api, db):
        user, client = setup_client(db)
        written_first = add_checkpoint(db, client, 1)
        written_second = add_checkpoint(db, client, 2)
        update_items(api, user, client, written_second)
        update_items(api, user, client, written_first)
        assert (
            self._remove(api, user, client, written_second).status_code == 409
        )
        assert (
            self._remove(api, user, client, written_first).status_code == 200
        )
        assert (
            self._remove(api, user, client, written_second).status_code == 200
        )

    def test_unknown_checkpoint_is_404(self, api, db):
        user, client = setup_client(db)
        r = self._remove(api, user, client, Checkpoint(id=uuid.uuid4()))
        assert r.status_code == 404


class TestRevert:
    def test_unknown_quotation_is_404(self, api, db):
        user, _ = setup_client(db)
        r = api.post(
            f"/api/v1/quotations/{uuid.uuid4()}/revert/{uuid.uuid4()}",
            headers=auth(user),
        )
        assert r.status_code == 404

    def test_missing_snapshot_is_404(self, api, db):
        user, client = setup_client(db)
        cp = add_checkpoint(db, client, 1)
        qid = update_items(api, user, client, cp).json()["quotation_id"]
        r = api.post(
            f"/api/v1/quotations/{qid}/revert/{uuid.uuid4()}",
            headers=auth(user),
        )
        assert r.status_code == 404

    def test_revert_drops_snapshot_and_unflags_checkpoint(self, api, db):
        user, client = setup_client(db)
        cp = add_checkpoint(db, client, 1)
        qid = update_items(api, user, client, cp).json()["quotation_id"]
        r = api.post(
            f"/api/v1/quotations/{qid}/revert/{cp.id}", headers=auth(user)
        )
        assert r.status_code == 200, r.text
        db.refresh(cp)
        assert cp.added_to_quotation is False
        assert db.get(Quotation, uuid.UUID(qid)).snapshots == []


class TestFromExtraction:
    def test_stores_unverified_items_and_leaves_quotation_alone(self, api, db):
        user, client = setup_client(db)
        r = api.post(
            f"/api/v1/clients/{client.id}/checkpoints/from-extraction",
            headers=auth(user),
            json={
                "summary_text": "notes",
                "line_items": [ITEM],
                "raw_transcript": "raw",
            },
        )
        assert r.status_code == 201, r.text
        cp = db.get(Checkpoint, uuid.UUID(r.json()["checkpoint_id"]))
        assert cp.structured_diff["line_items"][0]["verified"] is False
        assert cp.structured_diff["extraction"]["item_count"] == 1
        assert db.query(Quotation).filter_by(client_id=client.id).count() == 0

    def test_missing_mandatory_column_is_422(self, api, db):
        user, client = setup_client(db)
        r = api.post(
            f"/api/v1/clients/{client.id}/checkpoints/from-extraction",
            headers=auth(user),
            json={
                "summary_text": "n",
                "raw_transcript": "",
                "line_items": [{**ITEM, "room": ""}],
            },
        )
        assert r.status_code == 422
        assert "mandatory" in r.json()["detail"]

    def test_starter_draft_may_leave_mandatory_columns_blank(self, api, db):
        user, client = setup_client(db)
        r = api.post(
            f"/api/v1/clients/{client.id}/checkpoints/from-extraction",
            headers=auth(user),
            json={
                "summary_text": "n",
                "raw_transcript": "",
                "line_items": [{**ITEM, "unit": ""}],
                "allow_incomplete": True,
            },
        )
        assert r.status_code == 201, r.text

    def test_legacy_clients_still_sending_audit_log_id_are_accepted(
        self, api, db
    ):
        user, client = setup_client(db)
        r = api.post(
            f"/api/v1/clients/{client.id}/checkpoints/from-extraction",
            headers=auth(user),
            json={
                "audit_log_id": str(uuid.uuid4()),
                "summary_text": "n",
                "raw_transcript": "",
                "line_items": [ITEM],
            },
        )
        assert r.status_code == 201, r.text


class TestDraftMeetings:
    """Meetings not on the quotation can be edited and thrown away."""

    def test_notes_can_be_edited(self, api, db):
        user, client = setup_client(db)
        cp = add_checkpoint(db, client, 1)
        r = api.patch(
            f"/api/v1/checkpoints/{cp.id}/notes",
            headers=auth(user),
            json={"raw_conversation": "23K for each wardrobe"},
        )
        assert r.status_code == 200, r.text
        db.refresh(cp)
        assert cp.raw_conversation == "23K for each wardrobe"

    def test_draft_can_be_deleted(self, api, db):
        user, client = setup_client(db)
        cp = add_checkpoint(db, client, 1)
        r = api.delete(f"/api/v1/checkpoints/{cp.id}", headers=auth(user))
        assert r.status_code == 204
        assert db.get(Checkpoint, cp.id) is None

    def test_added_meeting_cannot_be_deleted_or_edited(self, api, db):
        user, client = setup_client(db)
        cp = add_checkpoint(db, client, 1)
        update_items(api, user, client, cp)
        assert (
            api.delete(f"/api/v1/checkpoints/{cp.id}", headers=auth(user))
        ).status_code == 409
        assert (
            api.patch(
                f"/api/v1/checkpoints/{cp.id}/notes",
                headers=auth(user),
                json={"raw_conversation": "x"},
            )
        ).status_code == 409

    def test_unknown_meeting_is_404(self, api, db):
        user, _ = setup_client(db)
        r = api.delete(
            f"/api/v1/checkpoints/{uuid.uuid4()}", headers=auth(user)
        )
        assert r.status_code == 404
