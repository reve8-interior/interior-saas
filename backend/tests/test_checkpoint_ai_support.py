"""DB-free tests for the checkpoint AI helpers and the router that uses them."""

from decimal import Decimal


from backend.models.quotation import Quotation
from backend.models.quotation_line_item import (
    QuotationCatalogType,
    QuotationItemStatus,
    QuotationLineItem,
)
from backend.services.checkpoint_ai_support import (
    extraction_record,
    item_summary,
    snapshot_line_items,
)


def _item(**kw) -> QuotationLineItem:
    base = dict(room="Kitchen", description="Cabinets", unit="sqft")
    return QuotationLineItem(**{**base, **kw})


class TestExtractionRecord:
    def test_contains_provenance_fields(self):
        rec = extraction_record(
            item_count=2, model_name="m", unmapped_notes=["n"]
        )
        assert rec["item_count"] == 2
        assert rec["model"] == "m"
        assert rec["unmapped_notes"] == ["n"]
        assert rec["ran_at"].endswith("+00:00")


class TestItemSummary:
    def test_full_item(self):
        s = item_summary(
            _item(
                raw_dimension="10x8", qty=Decimal("80"), rate=Decimal("1500")
            )
        )
        assert s == "Kitchen — Cabinets · 10x8 · 80 sqft · @ ₹1,500"

    def test_minimal_item_has_no_dangling_separators(self):
        assert item_summary(_item(unit=None)) == "Kitchen — Cabinets"

    def test_unit_without_qty(self):
        assert item_summary(_item()) == "Kitchen — Cabinets · sqft"


class TestSnapshotLineItems:
    def _quotation(self) -> Quotation:
        q = Quotation()
        q.line_items = [
            _item(
                qty=Decimal("2"),
                rate=Decimal("10"),
                status=QuotationItemStatus.agreed,
                catalog_type=QuotationCatalogType.core_works,
                position=0,
                extra={"finish": "matte"},
            )
        ]
        return q

    def test_appends_json_safe_snapshot(self):
        q = self._quotation()
        snapshot_line_items(q, "cp-1")
        snap = q.snapshots[0]
        assert snap["checkpoint_id"] == "cp-1"
        li = snap["line_items"][0]
        assert li["qty"] == 2.0 and li["rate"] == 10.0
        assert li["status"] == "agreed"
        assert li["extra"] == {"finish": "matte"}

    def test_keeps_earlier_snapshots(self):
        q = self._quotation()
        snapshot_line_items(q, "cp-1")
        snapshot_line_items(q, "cp-2")
        assert [s["checkpoint_id"] for s in q.snapshots] == ["cp-1", "cp-2"]


def test_router_still_exposes_endpoints():
    from backend.routers import checkpoint_ai

    paths = {r.path for r in checkpoint_ai.router.routes}
    assert any(p.endswith("/quotation/update-items") for p in paths)
    assert any(p.endswith("/checkpoints/extract") for p in paths)
