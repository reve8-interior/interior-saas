# ruff: noqa: F811
"""The unified list of public links across designs, quotations and portfolio."""

from .conftest import auth
from .test_quotation_versions import _save, studio  # noqa: F401

URL = "/api/v1/shared-links"


def _design_link(api, admin, client):
    return api.post(
        f"/api/v1/clients/{client.id}/share-links",
        headers=auth(admin),
        json={},
    ).json()


def _quotation_link(api, admin, client):
    version = _save(api, admin, client).json()
    share = api.post(
        f"/api/v1/quotation-versions/{version['id']}/shares",
        headers=auth(admin),
        json={},
    ).json()
    return version, share


def test_empty_without_links(api, studio):
    admin, _, _, _ = studio
    assert api.get(URL, headers=auth(admin)).json() == []


def test_lists_design_and_quotation_links_with_client(api, studio):
    admin, _, client, _ = studio
    _design_link(api, admin, client)
    version, share = _quotation_link(api, admin, client)

    rows = api.get(URL, headers=auth(admin)).json()
    assert {r["kind"] for r in rows} == {"designs", "quotation"}
    assert all(r["client_name"] == "Mrs Rao" for r in rows)
    quote = next(r for r in rows if r["kind"] == "quotation")
    assert quote["id"] == share["id"]
    assert quote["version_id"] == version["id"]
    assert quote["title"] == "Quotation version 1"
    assert quote["view_count"] == 0


def test_stopped_design_link_is_left_out(api, studio):
    admin, _, client, _ = studio
    link = _design_link(api, admin, client)
    api.delete(
        f"/api/v1/clients/{client.id}/share-links/{link['id']}",
        headers=auth(admin),
    )
    assert api.get(URL, headers=auth(admin)).json() == []


def test_other_business_sees_nothing(api, studio):
    admin_a, admin_b, client, _ = studio
    _design_link(api, admin_a, client)
    _quotation_link(api, admin_a, client)
    assert api.get(URL, headers=auth(admin_b)).json() == []
