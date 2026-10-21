"""Version snapshots, room-design attachment and the public room view."""

import uuid
from datetime import datetime, timezone

import pytest

from backend.models.design import Design, DesignSource
from backend.models.quotation import Quotation
from backend.models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from backend.models.quotation_version import QuotationVersion
from backend.models.user import UserRole
from backend.services.quotation_version import (
    AttachmentError,
    EmptyQuotationError,
    create_version,
    create_version_from_rows,
    default_room_designs,
    shared_rooms,
    to_summary,
    validate_room_designs,
)

from .conftest import (
    as_business,
    make_business,
    make_client_row,
    make_user,
)


@pytest.fixture
def studio(db):
    biz = make_business(db, "Alpha")
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    client = make_client_row(db, "Mrs Rao")
    quotation = Quotation(client_id=client.id)
    db.add(quotation)
    db.flush()
    return user, client, quotation


def _design(db, client, rooms=None):
    design = Design(
        client_id=client.id,
        source=DesignSource.designer_uploaded,
        image_url="https://img.example/x.png",
        rooms=rooms or [],
    )
    db.add(design)
    db.flush()
    return design


def _line(quotation, room="Kitchen", description="Cabinets", **kw):
    return QuotationLineItem(
        quotation_id=quotation.id,
        room=room,
        description=description,
        unit="nos",
        **kw,
    )


class TestValidateRoomDesigns:
    def test_unknown_room_is_422(self, db, studio):
        _, client, _ = studio
        with pytest.raises(AttachmentError) as exc:
            validate_room_designs(db, client.id, {"Kitchen"}, {"Attic": []})
        assert exc.value.status_code == 422

    def test_foreign_design_is_404(self, db, studio):
        _, client, _ = studio
        with pytest.raises(AttachmentError) as exc:
            validate_room_designs(
                db, client.id, {"Kitchen"}, {"Kitchen": [uuid.uuid4()]}
            )
        assert exc.value.status_code == 404

    def test_dedupes_and_drops_empty_rooms(self, db, studio):
        _, client, _ = studio
        design = _design(db, client)
        result = validate_room_designs(
            db,
            client.id,
            {"Kitchen", "Hall"},
            {"Kitchen": [design.id, design.id], "Hall": []},
        )
        assert result == {"Kitchen": [str(design.id)]}


class TestDefaultRoomDesigns:
    def test_matches_tags_case_insensitively_to_quotation_rooms(
        self, db, studio
    ):
        _, client, _ = studio
        design = _design(db, client, rooms=["KITCHEN", "garage"])
        assert default_room_designs(db, client.id, {"Kitchen", "Hall"}) == {
            "Kitchen": [str(design.id)]
        }

    def test_untagged_designs_attach_nowhere(self, db, studio):
        _, client, _ = studio
        _design(db, client)
        assert default_room_designs(db, client.id, {"Kitchen"}) == {}


class TestCreateVersion:
    def test_empty_quotation_is_rejected(self, db, studio):
        user, _, quotation = studio
        db.refresh(quotation)
        with pytest.raises(EmptyQuotationError):
            create_version(db, quotation, user.id)

    def test_numbers_increment_and_label_is_trimmed(self, db, studio):
        user, _, quotation = studio
        db.add(_line(quotation, initial_price=100))
        db.flush()
        db.refresh(quotation)
        v1 = create_version(db, quotation, user.id, label="  Draft  ")
        v2 = create_version(db, quotation, user.id, label="   ")
        assert (v1.number, v1.label) == (1, "Draft")
        assert (v2.number, v2.label) == (2, None)
        assert float(v1.initial_total) == 100

    def test_snapshot_is_independent_of_later_edits(self, db, studio):
        user, _, quotation = studio
        item = _line(quotation, initial_price=100)
        db.add(item)
        db.flush()
        db.refresh(quotation)
        version = create_version(db, quotation, user.id)
        item.initial_price = 999
        db.flush()
        assert version.line_items[0]["initial_price"] == 100

    def test_explicit_empty_room_designs_overrides_tag_defaults(
        self, db, studio
    ):
        user, client, quotation = studio
        _design(db, client, rooms=["Kitchen"])
        db.add(_line(quotation, initial_price=1))
        db.flush()
        db.refresh(quotation)
        assert create_version(db, quotation, user.id).room_designs != {}
        explicit = create_version(db, quotation, user.id, room_designs={})
        assert explicit.room_designs == {}


class TestCreateVersionFromRows:
    @staticmethod
    def _rows():
        return [
            {
                "room": "Kitchen",
                "description": "A",
                "unit": "sqft",
                "raw_dimension": "5'x3'",
                "rate": 100,
                "extra": {},
            },
            {
                "room": "Kitchen",
                "description": "B",
                "unit": "nos",
                "qty": 2,
                "rate": 50,
                "extra": {},
            },
            {
                "room": "Hall",
                "description": "Gone",
                "unit": "nos",
                "initial_price": 777,
                "status": QuotationItemStatus.removed,
                "extra": {},
            },
        ]

    def test_resolves_prices_and_excludes_removed_from_totals(
        self, db, studio
    ):
        user, _, quotation = studio
        version = create_version_from_rows(
            db, quotation, user.id, "Imported", self._rows()
        )
        # 5x3 = 15 sqft * 100, plus 2 * 50.
        assert float(version.initial_total) == 1600
        assert float(version.negotiated_total) == 1600
        assert [i["position"] for i in version.line_items] == [0, 1, 2]

    def test_does_not_touch_live_quotation(self, db, studio):
        user, _, quotation = studio
        create_version_from_rows(db, quotation, user.id, None, self._rows())
        db.refresh(quotation)
        assert quotation.line_items == []

    def test_unparseable_dimension_is_flagged_not_priced(self, db, studio):
        user, _, quotation = studio
        rows = [
            {
                "room": "R",
                "description": "D",
                "unit": "sqft",
                "raw_dimension": "garbage",
                "rate": 10,
                "extra": {},
            }
        ]
        version = create_version_from_rows(db, quotation, user.id, None, rows)
        assert version.line_items[0]["status"] == "pending_clarity"
        assert version.line_items[0]["initial_price"] is None

    def test_no_rows_is_rejected(self, db, studio):
        user, _, quotation = studio
        with pytest.raises(EmptyQuotationError):
            create_version_from_rows(db, quotation, user.id, None, [])


def _version(items: list[dict]) -> QuotationVersion:
    now = datetime.now(timezone.utc).isoformat()
    full = [
        {
            "id": str(uuid.uuid4()),
            "quotation_id": str(uuid.uuid4()),
            "position": 0,
            "catalog_type": "core_works",
            "unit": "sqft",
            "raw_dimension": None,
            "computed_sqft": None,
            "qty": 1,
            "rate": None,
            "initial_price": None,
            "negotiated_price": None,
            "est_time": None,
            "remarks": None,
            "extra": {},
            "status": "priced",
            "created_at": now,
            "updated_at": now,
            **item,
        }
        for item in items
    ]
    return QuotationVersion(
        id=uuid.uuid4(),
        quotation_id=uuid.uuid4(),
        number=1,
        line_items=full,
        initial_total=0,
        negotiated_total=0,
        room_designs={},
        is_active=True,
        is_agreed=False,
        created_at=datetime.now(timezone.utc),
    )


class TestSharedRooms:
    ITEMS = [
        {
            "room": "Kitchen",
            "description": "A",
            "rate": 10,
            "initial_price": 100,
            "negotiated_price": 80,
            "remarks": "SECRET",
            "extra": {"margin": 40},
        },
        {"room": "Kitchen", "description": "B", "initial_price": 50},
        {
            "room": "Hall",
            "description": "Gone",
            "initial_price": 999,
            "status": "removed",
        },
        {"room": "Hall", "description": "Free"},
    ]

    def test_prices_hidden_when_not_shown(self):
        groups, total = shared_rooms(_version(self.ITEMS), show_prices=False)
        assert total is None
        for group in groups:
            assert group.total is None
            for item in group.items:
                assert item.rate is None and item.amount is None

    def test_prices_shown_use_negotiated_and_skip_removed(self):
        groups, total = shared_rooms(_version(self.ITEMS), show_prices=True)
        by_room = {g.room: g for g in groups}
        assert by_room["Kitchen"].total == 130  # 80 negotiated + 50 initial
        assert by_room["Hall"].total == 0  # removed excluded, unpriced is 0
        assert [i.description for i in by_room["Hall"].items] == ["Free"]
        assert total == 130

    @pytest.mark.parametrize("show", [True, False])
    def test_internal_fields_never_serialised(self, show):
        groups, _ = shared_rooms(_version(self.ITEMS), show_prices=show)
        dumped = str([g.model_dump() for g in groups])
        assert "SECRET" not in dumped
        assert "margin" not in dumped
        assert "status" not in dumped

    def test_room_order_follows_first_appearance(self):
        groups, _ = shared_rooms(_version(self.ITEMS), show_prices=False)
        assert [g.room for g in groups] == ["Kitchen", "Hall"]


def test_to_summary_counts_items_and_parses_design_ids():
    version = _version([{"room": "K", "description": "A"}])
    design_id = uuid.uuid4()
    version.room_designs = {"K": [str(design_id)]}
    summary = to_summary(version)
    assert summary.item_count == 1
    assert summary.room_designs == {"K": [design_id]}
