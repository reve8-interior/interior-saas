"""The dashboard inbox: customer messages across all of a designer's clients."""
# ruff: noqa: F811

from .conftest import auth
from .test_dashboard_attention import _share
from .test_quotation_versions import studio  # noqa: F401

URL = "/api/v1/dashboard/inbox"


def _respond(api, token, **body):
    return api.post(f"/api/v1/quotation-share/{token}/respond", json=body)


def test_empty_when_no_customer_has_written(api, studio):
    admin, _, _, _ = studio
    assert api.get(URL, headers=auth(admin)).json() == []


def test_lists_questions_and_approvals_with_client(api, studio):
    admin, _, client, _ = studio
    _, token = _share(api, admin, client)
    _respond(api, token, kind="question", name="Rao", message="Finish?")

    [item] = api.get(URL, headers=auth(admin)).json()
    assert item["kind"] == "question"
    assert item["message"] == "Finish?"
    assert item["client_id"] == str(client.id)
    assert item["client_name"] == client.name
    assert item["resolved_at"] is None


def test_open_question_leads_and_resolving_demotes_it(api, studio):
    admin, _, client, _ = studio
    _, first = _share(api, admin, client)
    _respond(api, first, kind="question", name="Rao", message="Finish?")
    # A link takes one reply, so the approval comes from the next version's.
    _, second = _share(api, admin, client)
    _respond(api, second, kind="approved", name="Rao")

    kinds = [m["kind"] for m in api.get(URL, headers=auth(admin)).json()]
    assert kinds == ["question", "approved"]

    question = api.get(URL, headers=auth(admin)).json()[0]
    api.patch(
        f"/api/v1/quotation-messages/{question['id']}",
        headers=auth(admin),
        json={"resolved": True},
    )
    items = api.get(URL, headers=auth(admin)).json()
    # Resolved, the question falls back to newest-first order.
    assert [m["kind"] for m in items] == ["approved", "question"]
    assert items[1]["resolved_at"] is not None


def test_other_business_sees_nothing(api, studio):
    admin_a, admin_b, client, _ = studio
    _, token = _share(api, admin_a, client)
    _respond(api, token, kind="question", name="Rao", message="Finish?")
    assert api.get(URL, headers=auth(admin_b)).json() == []
