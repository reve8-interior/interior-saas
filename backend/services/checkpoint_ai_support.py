"""Helpers behind the AI checkpoint endpoints: snapshots, audit, hints."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.agent_audit_log import AgentAuditLog
from ..models.material import MaterialRate
from ..models.quotation import Quotation
from ..models.quotation_line_item import QuotationLineItem
from ..schemas.checkpoint_ai import MaterialHint
from .ai_access import (
    OP_CHECKPOINT_EXTRACT,
    log_ai_usage,
)
from .extraction_postprocess import (
    NormalizedItem,
)
from .quotation_service import resolve_line_item


def restore_snapshot_items(
    quotation: Quotation, snapshot: dict, db: Session
) -> int:
    """Replace the quotation's line items with a snapshot's items."""
    for li in list(quotation.line_items):
        db.delete(li)
    db.flush()

    restored_items = snapshot.get("line_items", [])
    for pos, snap_li in enumerate(restored_items):
        li = QuotationLineItem(
            quotation_id=quotation.id,
            room=snap_li["room"],
            description=snap_li["description"],
            unit=snap_li["unit"],
            raw_dimension=snap_li.get("raw_dimension"),
            qty=snap_li.get("qty"),
            rate=snap_li.get("rate"),
            remarks=snap_li.get("remarks"),
            est_time=snap_li.get("est_time"),
            extra=snap_li.get("extra") or {},
            catalog_type=snap_li.get("catalog_type", "core_works"),
            position=snap_li.get("position", pos),
            negotiated_price=snap_li.get("negotiated_price"),
        )
        resolve_line_item(li)
        # Older snapshots lack status; newer ones restore it verbatim.
        if snap_li.get("status"):
            li.status = snap_li["status"]
        db.add(li)
    return len(restored_items)


def extraction_record(
    *,
    item_count: int,
    model_name: str,
    unmapped_notes: list[str],
    questions: list[dict] | None = None,
) -> dict:
    """Provenance stamp proving extraction ran on this checkpoint.

    Without it an empty `line_items` list is ambiguous: it means both
    "nobody has extracted yet" and "extraction ran and this meeting
    changed no billable work". The UI showed the first for both and
    offered to extract again, which produced the same empty result
    forever. `ran_at` disambiguates.
    """
    return {
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "model": model_name,
        "item_count": item_count,
        "unmapped_notes": unmapped_notes,
        "questions": questions or [],
    }


def item_summary(item: QuotationLineItem) -> str:
    """One-line rendering of a live item, shown beside a proposed edit."""
    bits: list[str] = [f"{item.room} — {item.description}"]
    if item.raw_dimension:
        bits.append(str(item.raw_dimension))
    if item.qty is not None:
        bits.append(f"{float(item.qty):g} {item.unit or ''}".strip())
    elif item.unit:
        bits.append(str(item.unit))
    if item.rate is not None:
        bits.append(f"@ ₹{float(item.rate):,.0f}")
    return " · ".join(bits)


def material_hints(
    line_items: list[NormalizedItem], db: Session
) -> list[MaterialHint]:
    """Match materials by name/category to items lacking a rate (up to 20)."""
    no_rate = [
        li for li in line_items if li.rate is None and li.action != "remove"
    ]
    if not no_rate:
        return []

    all_materials = db.execute(select(MaterialRate)).scalars().all()
    hints: dict[str, MaterialHint] = {}
    for li in no_rate:
        desc_lower = li.description.lower()
        for mat in all_materials:
            if (
                mat.name.lower() in desc_lower
                or mat.category.lower() in desc_lower
            ):
                hints[str(mat.id)] = MaterialHint(
                    name=mat.name,
                    category=mat.category,
                    unit=mat.unit,
                    unit_cost=float(mat.unit_cost),
                )
            if len(hints) >= 20:
                break
    return list(hints.values())


def write_audit_log(
    db: Session,
    *,
    client_id: str,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: int,
    status: str,
    raw_hash: str,
    prompt_version: str | None = None,
    guard_flags: list[dict] | None = None,
    proposed_output: dict | None = None,
) -> AgentAuditLog:
    return log_ai_usage(
        db,
        operation=OP_CHECKPOINT_EXTRACT,
        model=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        status=status,
        client_id=uuid.UUID(client_id),
        raw_input_hash=raw_hash,
        prompt_version=prompt_version,
        guard_flags=guard_flags,
        proposed_output=proposed_output,
    )


def record_final_output(
    db: Session,
    audit_log_id: str | None,
    client_id: str,
    line_items: list,
) -> None:
    """Store the rows the designer saved beside what the AI proposed.

    Silently skipped for an unknown or foreign run id: this is evaluation
    data, never a reason to fail the save.
    """
    if not audit_log_id:
        return
    try:
        log_id = uuid.UUID(audit_log_id)
    except ValueError:
        return
    log = db.get(AgentAuditLog, log_id)
    if log is None or log.client_id != uuid.UUID(client_id):
        return
    log.final_output = {
        "line_items": [
            {
                "action": li.action,
                "target_item_id": getattr(li, "target_item_id", None),
                "room": li.room,
                "description": li.description,
                "unit": li.unit,
                "raw_dimension": li.raw_dimension,
                "qty": li.qty,
                "rate": li.rate,
            }
            for li in line_items
        ]
    }


def snapshot_line_items(quotation: Quotation, checkpoint_id: str) -> None:
    """Append current line items as a snapshot keyed by checkpoint_id."""
    snapshot = {
        "checkpoint_id": checkpoint_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "line_items": [
            {
                "room": li.room,
                "description": li.description,
                "unit": li.unit,
                "raw_dimension": li.raw_dimension,
                "qty": float(li.qty) if li.qty is not None else None,
                "rate": float(li.rate) if li.rate is not None else None,
                "initial_price": (
                    float(li.initial_price)
                    if li.initial_price is not None
                    else None
                ),
                "negotiated_price": (
                    float(li.negotiated_price)
                    if li.negotiated_price is not None
                    else None
                ),
                "status": (
                    li.status.value
                    if hasattr(li.status, "value")
                    else li.status
                ),
                "est_time": li.est_time,
                "extra": dict(li.extra or {}),
                "remarks": li.remarks,
                "catalog_type": (
                    li.catalog_type.value
                    if hasattr(li.catalog_type, "value")
                    else li.catalog_type
                ),
                "position": li.position,
            }
            for li in quotation.line_items
        ],
    }
    existing: list = list(quotation.snapshots or [])
    existing.append(snapshot)
    quotation.snapshots = existing
