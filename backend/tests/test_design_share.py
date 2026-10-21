"""Design image upload, hotspots and public share links, over HTTP."""

from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import pytest

from backend.core.config import settings
from backend.models.material import MaterialRate
from backend.models.user import UserRole
from backend.services import storage

from .conftest import (
    as_business,
    as_owner,
    auth,
    make_business,
    make_client_row,
    make_user,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture(autouse=True)
def local_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "storage_local_dir", str(tmp_path))
    storage.get_storage.cache_clear()
    yield
    storage.get_storage.cache_clear()


@pytest.fixture
def studio(db):
    """Two businesses; business A has an admin, a client and a material."""
    a, b = make_business(db, "Alpha Interiors"), make_business(db, "Beta")
    admin_a = make_user(db, role=UserRole.admin, business=a)
    admin_b = make_user(db, role=UserRole.admin, business=b)
    as_business(db, a.id)
    client_a = make_client_row(db, "Mrs Rao")
    mat_a = MaterialRate(
        name="Teak veneer",
        category="Wood",
        unit="sqft",
        unit_cost=250,
        vendor="Secret Timber Co",
    )
    db.add(mat_a)
    as_business(db, b.id)
    mat_b = MaterialRate(
        name="Beta only", category="Wood", unit="sqft", unit_cost=1
    )
    db.add(mat_b)
    as_owner(db)
    db.flush()
    return admin_a, admin_b, client_a, mat_a, mat_b


def _upload(api, admin, client, data=PNG, name="room.png"):
    return api.post(
        f"/api/v1/clients/{client.id}/designs/upload",
        headers=auth(admin),
        files={"file": (name, data, "image/png")},
    )


def _hotspot(**over):
    body = {"label": "Wardrobe", "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4}
    return {**body, **over}


def test_upload_rejects_non_image_and_oversize(api, studio, monkeypatch):
    admin, _, client, *_ = studio
    assert _upload(api, admin, client, b"<html></html>").status_code == 415
    monkeypatch.setattr(settings, "max_image_bytes", 10)
    assert _upload(api, admin, client).status_code == 413


def test_upload_serves_image_via_signed_url(api, studio):
    admin, _, client, *_ = studio
    r = _upload(api, admin, client)
    assert r.status_code == 201
    url = urlparse(r.json()["image_url"])

    ok = api.get(f"{url.path}?{url.query}")
    assert ok.status_code == 200
    assert ok.content == PNG
    assert ok.headers["content-type"] == "image/png"

    last = "1" if url.query[-1] == "0" else "0"
    tampered = api.get(f"{url.path}?{url.query[:-1]}{last}")
    assert tampered.status_code == 404


def test_hotspot_validation_and_material_scoping(api, studio):
    admin_a, _, client, mat_a, mat_b = studio
    design = _upload(api, admin_a, client).json()
    base = f"/api/v1/clients/{client.id}/designs/{design['id']}/hotspots"
    h = auth(admin_a)

    assert api.post(base, headers=h, json=_hotspot(x=0.9)).status_code == 422
    assert api.post(base, headers=h, json=_hotspot(x=1.5)).status_code == 422
    other = api.post(base, headers=h, json=_hotspot(material_id=str(mat_b.id)))
    assert other.status_code == 404

    ok = api.post(base, headers=h, json=_hotspot(material_id=str(mat_a.id)))
    assert ok.status_code == 201
    assert ok.json()["material"]["name"] == "Teak veneer"

    listed = api.get(f"/api/v1/clients/{client.id}/designs", headers=h).json()
    assert len(listed[0]["hotspots"]) == 1


def test_other_business_cannot_touch_designs(api, studio):
    admin_a, admin_b, client, *_ = studio
    design = _upload(api, admin_a, client).json()
    path = f"/api/v1/clients/{client.id}/designs/{design['id']}"
    assert api.delete(path, headers=auth(admin_b)).status_code == 404


def _share(api, admin, client, **body):
    return api.post(
        f"/api/v1/clients/{client.id}/share-links",
        headers=auth(admin),
        json=body,
    )


def _shared_setup(api, studio):
    admin, _, client, mat_a, _ = studio
    design = _upload(api, admin, client).json()
    api.post(
        f"/api/v1/clients/{client.id}/designs/{design['id']}/hotspots",
        headers=auth(admin),
        json=_hotspot(material_id=str(mat_a.id)),
    )
    return admin, client, design


def test_public_view_hides_prices_and_vendor_by_default(api, studio):
    admin, client, _ = _shared_setup(api, studio)
    link = _share(api, admin, client).json()
    token = link["url"].rsplit("/", 1)[-1]

    r = api.get(f"/api/v1/share/{token}")  # no auth header
    assert r.status_code == 200
    body = r.json()
    assert body["business_name"] == "Alpha Interiors"
    item = body["designs"][0]["hotspots"][0]["item"]
    assert item == {
        "name": "Teak veneer",
        "category": "Wood",
        "unit": "sqft",
        "unit_cost": None,
    }
    assert "Secret Timber Co" not in r.text


def test_public_view_shows_prices_when_enabled(api, studio):
    admin, client, _ = _shared_setup(api, studio)
    link = _share(api, admin, client, show_prices=True).json()
    token = link["url"].rsplit("/", 1)[-1]
    item = api.get(f"/api/v1/share/{token}").json()["designs"][0]["hotspots"][
        0
    ]["item"]
    assert float(item["unit_cost"]) == 250.0


def test_revoked_expired_and_unknown_links_are_404(api, db, studio):
    admin, client, _ = _shared_setup(api, studio)
    link = _share(api, admin, client).json()
    token = link["url"].rsplit("/", 1)[-1]
    assert api.get(f"/api/v1/share/{token}").status_code == 200

    revoke = api.delete(
        f"/api/v1/clients/{client.id}/share-links/{link['id']}",
        headers=auth(admin),
    )
    assert revoke.status_code == 204
    assert api.get(f"/api/v1/share/{token}").status_code == 404
    assert api.get("/api/v1/share/not-a-token").status_code == 404

    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert _share(api, admin, client, expires_at=past).status_code == 422


def test_share_link_only_includes_selected_designs(api, studio):
    admin, client, design = _shared_setup(api, studio)
    _upload(api, admin, client, name="second.png")
    link = _share(api, admin, client, design_ids=[design["id"]]).json()
    token = link["url"].rsplit("/", 1)[-1]
    shared = api.get(f"/api/v1/share/{token}").json()["designs"]
    assert [d["id"] for d in shared] == [design["id"]]


def test_share_link_rejects_designs_of_another_client(api, db, studio):
    admin, _, client, *_ = studio
    as_business(db, admin.business_id)
    other = make_client_row(db, "Someone else")
    as_owner(db)
    foreign = _upload(api, admin, other).json()
    r = _share(api, admin, client, design_ids=[foreign["id"]])
    assert r.status_code == 404


# --- Add to quotation ------------------------------------------------------


def _saved_hotspot(api, admin, client, material=None, **over):
    design = _upload(api, admin, client).json()
    body = _hotspot(label="TV wall", notes="Matte finish", **over)
    if material is not None:
        body["material_id"] = str(material.id)
    hs = api.post(
        f"/api/v1/clients/{client.id}/designs/{design['id']}/hotspots",
        headers=auth(admin),
        json=body,
    ).json()
    return design, hs


def _add_url(client, design, hs):
    return (
        f"/api/v1/clients/{client.id}/designs/{design['id']}"
        f"/hotspots/{hs['id']}/add-to-quotation"
    )


def test_add_to_quotation_creates_priced_line_and_links_hotspot(api, studio):
    admin, _, client, mat_a, _ = studio
    design, hs = _saved_hotspot(api, admin, client, mat_a)

    r = api.post(
        _add_url(client, design, hs),
        headers=auth(admin),
        json={"room": "Living Room", "raw_dimension": "5'x3'"},
    )
    assert r.status_code == 201
    assert r.json()["quotation_line_item_id"]

    quotation = api.get(
        f"/api/v1/clients/{client.id}/quotation", headers=auth(admin)
    ).json()
    (group,) = quotation["rooms"]
    (item,) = group["items"]
    assert group["room"] == "Living Room"
    assert item["description"] == "TV wall"  # from the hotspot label
    assert item["unit"] == "sqft" and item["rate"] == 250  # from the material
    assert item["computed_sqft"] == 15
    assert item["initial_price"] == 3750
    assert item["remarks"] == "Matte finish"
    assert item["material_id"] == str(mat_a.id)
    assert item["id"] == r.json()["quotation_line_item_id"]


def test_add_to_quotation_twice_is_409_until_the_line_is_deleted(api, studio):
    admin, _, client, mat_a, _ = studio
    design, hs = _saved_hotspot(api, admin, client, mat_a)
    h, body = auth(admin), {"room": "Hall", "qty": 2}

    first = api.post(_add_url(client, design, hs), headers=h, json=body)
    assert first.status_code == 201
    assert (
        api.post(
            _add_url(client, design, hs), headers=h, json=body
        ).status_code
        == 409
    )

    quotation = api.get(
        f"/api/v1/clients/{client.id}/quotation", headers=h
    ).json()
    gone = api.delete(
        f"/api/v1/quotations/{quotation['id']}/items/"
        f"{first.json()['quotation_line_item_id']}",
        headers=h,
    )
    assert gone.status_code == 204
    assert (
        api.post(
            _add_url(client, design, hs), headers=h, json=body
        ).status_code
        == 201
    )


def test_add_to_quotation_needs_a_unit_without_material(api, studio):
    admin, _, client, *_ = studio
    design, hs = _saved_hotspot(api, admin, client)
    h = auth(admin)

    missing = api.post(
        _add_url(client, design, hs), headers=h, json={"room": "Hall"}
    )
    assert missing.status_code == 422
    # The failed attempt must not have left an empty quotation behind.
    assert (
        api.get(
            f"/api/v1/clients/{client.id}/quotation", headers=h
        ).status_code
        == 404
    )

    ok = api.post(
        _add_url(client, design, hs),
        headers=h,
        json={"room": "Hall", "unit": "nos", "qty": 1, "rate": 900},
    )
    assert ok.status_code == 201


def test_add_to_quotation_blocked_once_approved(api, studio):
    admin, _, client, mat_a, _ = studio
    design, hs = _saved_hotspot(api, admin, client, mat_a)
    other_design, other = _saved_hotspot(api, admin, client, mat_a)
    h = auth(admin)

    assert (
        api.post(
            _add_url(client, design, hs),
            headers=h,
            json={"room": "Hall", "qty": 1},
        ).status_code
        == 201
    )
    # Pricing is derived, so the single line is priced; mark it agreed.
    quotation = api.get(
        f"/api/v1/clients/{client.id}/quotation", headers=h
    ).json()
    item_id = quotation["rooms"][0]["items"][0]["id"]
    api.patch(
        f"/api/v1/quotations/{quotation['id']}/items/{item_id}",
        headers=h,
        json={"status": "agreed"},
    )
    assert (
        api.post(
            f"/api/v1/clients/{client.id}/quotation/approve", headers=h
        ).status_code
        == 200
    )

    r = api.post(
        _add_url(client, other_design, other),
        headers=h,
        json={"room": "Hall", "qty": 1},
    )
    assert r.status_code == 409


def test_other_business_cannot_add_to_quotation(api, studio):
    admin_a, admin_b, client, mat_a, _ = studio
    design, hs = _saved_hotspot(api, admin_a, client, mat_a)
    r = api.post(
        _add_url(client, design, hs),
        headers=auth(admin_b),
        json={"room": "Hall", "qty": 1},
    )
    assert r.status_code == 404


# --- Portfolio -------------------------------------------------------------


def _opt_in(api, admin, client, design, value=True):
    return api.put(
        f"/api/v1/clients/{client.id}/designs/{design['id']}/portfolio",
        headers=auth(admin),
        json={"in_portfolio": value},
    )


def test_portfolio_shows_no_client_names_or_prices(api, studio):
    admin, client, design = _shared_setup(api, studio)
    _opt_in(api, admin, client, design)
    token = _portfolio_share(api, admin, [design["id"]]).json()["url"]
    token = token.rsplit("/", 1)[-1]

    r = api.get(f"/api/v1/portfolio/{token}")  # no auth header
    body = r.json()
    assert body["business_name"] == "Alpha Interiors"
    assert [d["id"] for d in body["designs"]] == [design["id"]]
    assert body["designs"][0]["hotspots"][0]["item"]["unit_cost"] is None
    assert "Mrs Rao" not in r.text
    assert "Secret Timber Co" not in r.text


def test_portfolio_unknown_token_is_404(api):
    assert api.get("/api/v1/portfolio/not-a-token").status_code == 404


def test_portfolio_designs_lists_only_opted_in_with_owner(api, db, studio):
    admin_a, admin_b, client, *_ = studio
    design = _upload(api, admin_a, client).json()
    _opt_in(api, admin_a, client, design)
    as_business(db, admin_a.business_id)
    other = make_client_row(db, "Mr Iyer")
    as_owner(db)
    _upload(api, admin_a, other, name="private.png")  # not opted in

    rows = api.get("/api/v1/portfolio-designs", headers=auth(admin_a)).json()
    assert [(r["id"], r["client_name"]) for r in rows] == [
        (design["id"], "Mrs Rao")
    ]
    assert (
        api.get("/api/v1/portfolio-designs", headers=auth(admin_b)).json()
        == []
    )


def _portfolio_share(api, admin, design_ids, **body):
    return api.post(
        "/api/v1/portfolio-shares",
        headers=auth(admin),
        json={"design_ids": design_ids, **body},
    )


def test_portfolio_share_shows_only_picked_designs_and_can_be_revoked(
    api, studio
):
    admin, client, design = _shared_setup(api, studio)
    other = _upload(api, admin, client, name="other.png").json()
    for d in (design, other):
        _opt_in(api, admin, client, d)

    r = _portfolio_share(api, admin, [design["id"]])
    assert r.status_code == 201
    token = r.json()["url"].rsplit("/", 1)[-1]
    shared = api.get(f"/api/v1/portfolio/{token}").json()["designs"]
    assert [d["id"] for d in shared] == [design["id"]]

    listed = api.get("/api/v1/portfolio-shares", headers=auth(admin)).json()
    assert [s["id"] for s in listed] == [r.json()["id"]]

    gone = api.delete(
        f"/api/v1/portfolio-shares/{r.json()['id']}", headers=auth(admin)
    )
    assert gone.status_code == 204
    assert api.get(f"/api/v1/portfolio/{token}").status_code == 404


def test_portfolio_share_rejects_bad_input(api, studio):
    admin_a, admin_b, client, *_ = studio
    _, _, design = _shared_setup(api, studio)

    # Not opted in yet.
    assert _portfolio_share(api, admin_a, [design["id"]]).status_code == 404
    _opt_in(api, admin_a, client, design)

    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert (
        _portfolio_share(
            api, admin_a, [design["id"]], expires_at=past
        ).status_code
        == 422
    )
    assert _portfolio_share(api, admin_a, []).status_code == 422
    # Another business cannot share this design.
    assert _portfolio_share(api, admin_b, [design["id"]]).status_code == 404


def test_portfolio_share_drops_designs_removed_from_portfolio(api, studio):
    admin, client, design = _shared_setup(api, studio)
    _opt_in(api, admin, client, design)
    url = _portfolio_share(api, admin, [design["id"]]).json()["url"]
    token = url.rsplit("/", 1)[-1]

    _opt_in(api, admin, client, design, False)
    assert api.get(f"/api/v1/portfolio/{token}").json()["designs"] == []


def _costed_setup(api, studio):
    admin, _, client, *_ = studio
    design = _upload(api, admin, client).json()
    base = f"/api/v1/clients/{client.id}/designs/{design['id']}/hotspots"
    r = api.post(
        base,
        headers=auth(admin),
        json=_hotspot(dimensions="8ft x 7ft", labour_cost="1500.50"),
    )
    return admin, client, design, base, r


def test_hotspot_stores_dimensions_and_labour_cost(api, studio):
    admin, client, design, base, created = _costed_setup(api, studio)
    assert created.status_code == 201
    assert created.json()["dimensions"] == "8ft x 7ft"
    assert float(created.json()["labour_cost"]) == 1500.50

    updated = api.put(
        f"{base}/{created.json()['id']}",
        headers=auth(admin),
        json=_hotspot(dimensions=None, labour_cost=None),
    )
    assert updated.status_code == 200
    assert updated.json()["dimensions"] is None
    assert updated.json()["labour_cost"] is None


def test_hotspot_rejects_negative_labour_and_long_dimensions(api, studio):
    admin, _, _, base, _ = _costed_setup(api, studio)
    h = auth(admin)
    assert (
        api.post(base, headers=h, json=_hotspot(labour_cost=-1)).status_code
        == 422
    )
    assert (
        api.post(
            base, headers=h, json=_hotspot(dimensions="x" * 101)
        ).status_code
        == 422
    )


def test_share_hides_labour_cost_unless_prices_shown(api, studio):
    admin, client, *_ = _costed_setup(api, studio)

    def hotspot(show_prices):
        link = _share(api, admin, client, show_prices=show_prices).json()
        token = link["url"].rsplit("/", 1)[-1]
        return api.get(f"/api/v1/share/{token}").json()["designs"][0][
            "hotspots"
        ][0]

    hidden = hotspot(False)
    assert hidden["dimensions"] == "8ft x 7ft"
    assert hidden["labour_cost"] is None
    assert float(hotspot(True)["labour_cost"]) == 1500.50


def test_portfolio_exposes_dimensions_but_never_labour_cost(api, studio):
    admin, client, design, *_ = _costed_setup(api, studio)
    _opt_in(api, admin, client, design)
    token = _portfolio_share(api, admin, [design["id"]]).json()["url"]
    token = token.rsplit("/", 1)[-1]
    spot = api.get(f"/api/v1/portfolio/{token}").json()["designs"][0][
        "hotspots"
    ][0]
    assert spot["dimensions"] == "8ft x 7ft"
    assert spot["labour_cost"] is None
