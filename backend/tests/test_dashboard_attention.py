"""The dashboard "Needs attention" feed: replies, expiring links, unclear rows."""
# ruff: noqa: F811

from datetime import datetime, timedelta, timezone

from backend.models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)

from .conftest import auth
from .test_quotation_versions import _save, studio  # noqa: F401

URL = "/api/v1/dashboard/attention"


def _share(api, admin, client, **body):
    version = _save(api, admin, client).json()
    share = api.post(
        f"/api/v1/quotation-versions/{version['id']}/shares",
        headers=auth(admin),
        json=body,
    ).json()
    return version, share["url"].rsplit("/", 1)[1]


def test_empty_when_nothing_needs_attention(api, studio):
    admin, _, _, _ = studio
    assert api.get(URL, headers=auth(admin)).json() == []


def test_customer_reply_is_listed_with_link_to_version(api, studio):
    admin, _, client, _ = studio
    _, token = _share(api, admin, client)
    api.post(
        f"/api/v1/quotation-share/{token}/respond",
        json={"kind": "question", "name": "Mrs Rao", "message": "Finish?"},
    )

    [item] = api.get(URL, headers=auth(admin)).json()
    assert item["kind"] == "customer_question"
    assert item["client_name"] == "Mrs Rao"
    assert item["detail"] == "Finish?"
    assert item["title"].endswith("(version 1)")
    assert item["path"].endswith("#customer-messages")


def test_expiring_link_listed_but_far_future_link_is_not(api, studio):
    admin, _, client, _ = studio
    later = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    _share(api, admin, client, expires_at=later)
    assert api.get(URL, headers=auth(admin)).json() == []

    # Sharing a newer version replaces the old link, so only this one counts.
    soon = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    _share(api, admin, client, expires_at=soon)
    kinds = [i["kind"] for i in api.get(URL, headers=auth(admin)).json()]
    assert kinds == ["link_expiring"]


def test_unclear_rows_are_counted_per_client(api, studio, db):
    admin, _, client, quotation = studio
    db.add(
        QuotationLineItem(
            quotation_id=quotation.id,
            room="Hall",
            description="Panel",
            unit="sqft",
            status=QuotationItemStatus.pending_clarity,
        )
    )
    db.flush()

    [item] = api.get(URL, headers=auth(admin)).json()
    assert item["kind"] == "needs_clarity"
    assert item["title"] == "1 quotation item needs clarity"


def test_other_business_sees_nothing(api, studio):
    admin_a, admin_b, client, _ = studio
    _share(api, admin_a, client)
    assert api.get(URL, headers=auth(admin_b)).json() == []


def test_marking_an_item_read_is_remembered_and_idempotent(api, studio):
    admin, _, client, _ = studio
    _, token = _share(api, admin, client)
    api.post(
        f"/api/v1/quotation-share/{token}/respond",
        json={"kind": "approved", "name": "Rao"},
    )

    [item] = api.get(URL, headers=auth(admin)).json()
    assert item["read"] is False and item["key"]

    body = {"keys": [item["key"]]}
    for _ in range(2):
        done = api.post(f"{URL}/read", headers=auth(admin), json=body)
        assert done.status_code == 204
    assert api.get(URL, headers=auth(admin)).json()[0]["read"] is True


def test_marking_read_needs_at_least_one_key(api, studio):
    admin, _, _, _ = studio
    empty = api.post(f"{URL}/read", headers=auth(admin), json={"keys": []})
    assert empty.status_code == 422


def _ask(api, token, text, name="Rao"):
    return api.post(
        f"/api/v1/quotation-share/{token}/respond",
        json={"kind": "question", "name": name, "message": text},
    )


def test_every_open_question_lights_the_bell_until_resolved(
    api, studio, monkeypatch
):
    from backend.routers import quotation_versions

    monkeypatch.setattr(quotation_versions, "_RESPONSE_COOLDOWN_SECONDS", 0)
    admin, _, client, _ = studio
    _, token = _share(api, admin, client)
    _ask(api, token, "Finish?", "Mrs Rao")
    _ask(api, token, "Delivery date?", "Mr Rao")

    messages = api.get(
        f"/api/v1/clients/{client.id}/quotation/messages", headers=auth(admin)
    ).json()
    assert [m["message"] for m in messages] == ["Delivery date?", "Finish?"]

    items = api.get(URL, headers=auth(admin)).json()
    assert [i["kind"] for i in items] == ["customer_question"] * 2
    # Marking read does not silence an open question.
    api.post(
        f"{URL}/read", headers=auth(admin), json={"keys": [items[0]["key"]]}
    )
    assert all(not i["read"] for i in api.get(URL, headers=auth(admin)).json())

    done = api.patch(
        f"/api/v1/quotation-messages/{messages[0]['id']}",
        headers=auth(admin),
        json={"resolved": True},
    )
    assert done.status_code == 200 and done.json()["resolved_at"]
    [left] = api.get(URL, headers=auth(admin)).json()
    assert left["detail"] == "Finish?"

    reopened = api.patch(
        f"/api/v1/quotation-messages/{messages[0]['id']}",
        headers=auth(admin),
        json={"resolved": False},
    )
    assert reopened.json()["resolved_at"] is None
    assert len(api.get(URL, headers=auth(admin)).json()) == 2


def test_messages_survive_the_link_moving_to_a_newer_version(api, studio):
    admin, _, client, _ = studio
    _, token = _share(api, admin, client)
    _ask(api, token, "Finish?")
    _share(api, admin, client)  # link moves to version 2, share reply resets

    messages = api.get(
        f"/api/v1/clients/{client.id}/quotation/messages", headers=auth(admin)
    ).json()
    assert [(m["message"], m["version_number"]) for m in messages] == [
        ("Finish?", 1)
    ]
    assert len(api.get(URL, headers=auth(admin)).json()) == 1


def test_other_business_cannot_read_or_resolve_messages(api, studio):
    admin_a, admin_b, client, _ = studio
    _, token = _share(api, admin_a, client)
    _ask(api, token, "Finish?")
    [message] = api.get(
        f"/api/v1/clients/{client.id}/quotation/messages",
        headers=auth(admin_a),
    ).json()

    assert (
        api.get(
            f"/api/v1/clients/{client.id}/quotation/messages",
            headers=auth(admin_b),
        ).status_code
        == 404
    )
    other = api.patch(
        f"/api/v1/quotation-messages/{message['id']}",
        headers=auth(admin_b),
        json={"resolved": True},
    )
    assert other.status_code == 404
