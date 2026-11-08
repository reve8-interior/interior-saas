"""Floor-plan image → confirmed-able rooms: validate, read, guard, log."""

from __future__ import annotations

import hashlib
import logging
import time
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..agents.floorplan_agent import run_floorplan_extraction
from ..agents.prompts.floorplan_extraction import FLOORPLAN_PROMPT_VERSION
from ..models.business import Business
from ..models.checkpoint import Checkpoint, CheckpointSource
from ..models.quotation import Quotation
from ..models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from ..models.user import User
from ..schemas.floorplan import (
    FloorPlanExtractResponse,
    FloorPlanRoomOut,
)
from .ai_access import (
    OP_FLOORPLAN_EXTRACT,
    enforce_extraction_quota,
    log_ai_usage,
    resolve_openai_access,
)
from .floorplan_draft import PendingRow, room_warnings
from .floorplan_storage import store_floorplan_image
from .image_quota import MB, effective_max_bytes, ensure_can_upload
from .room_matching import match_rooms
from .storage import sniff_image_ext

logger = logging.getLogger(__name__)

MAX_PLAN_BYTES = 8 * 1024 * 1024
_MEDIA_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def quoted_items(db: Session, client_id: str) -> list[QuotationLineItem]:
    """The client's live quotation lines."""
    return list(
        db.execute(
            select(QuotationLineItem)
            .join(Quotation, QuotationLineItem.quotation_id == Quotation.id)
            .where(
                Quotation.client_id == uuid.UUID(client_id),
                QuotationLineItem.status != QuotationItemStatus.removed,
            )
        ).scalars()
    )


def pending_rows(db: Session, client_id: str) -> list[PendingRow]:
    """Rows of the client's drafts that have not been added to the quotation."""
    checkpoints = db.execute(
        select(Checkpoint).where(
            Checkpoint.client_id == uuid.UUID(client_id),
            Checkpoint.source == CheckpointSource.ai_extract,
            Checkpoint.added_to_quotation.is_(False),
        )
    ).scalars()
    return [
        PendingRow(room=str(row["room"]), description=str(row["description"]))
        for cp in checkpoints
        for row in (cp.structured_diff or {}).get("line_items", [])
        if row.get("action", "add") == "add"
        and row.get("room")
        and row.get("description")
    ]


def rate_book(db: Session) -> list[tuple[str, str, float]]:
    """(description, unit, rate) of the business's priced past rows."""
    rows = db.execute(
        select(
            QuotationLineItem.description,
            QuotationLineItem.unit,
            QuotationLineItem.rate,
        ).where(QuotationLineItem.rate.is_not(None))
    ).all()
    return [(d, u, float(r)) for d, u, r in rows]


async def extract_floorplan(
    db: Session,
    *,
    current_user: User,
    client_id: str,
    business: Business | None,
    image: bytes,
) -> FloorPlanExtractResponse:
    """Read rooms from a plan image; errors are generic, never provider text.

    A readable plan is kept in storage and counts toward the business's
    image allowance once a meeting is saved from it.
    """
    access = resolve_openai_access(current_user)
    enforce_extraction_quota(db, current_user)
    ensure_can_upload(business, db)

    ext = sniff_image_ext(image)
    if ext not in _MEDIA_TYPES:
        raise HTTPException(
            status_code=415, detail="Only JPEG, PNG or WebP images"
        )
    max_bytes = min(MAX_PLAN_BYTES, effective_max_bytes(business, db))
    if len(image) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Plan image must be {max_bytes // MB} MB or smaller",
        )

    raw_hash = hashlib.sha256(image).hexdigest()
    t0 = time.monotonic()
    try:
        extraction, tokens_in, tokens_out = await run_floorplan_extraction(
            image, _MEDIA_TYPES[ext], access.api_key, access.model
        )
    except Exception:
        log_ai_usage(
            db,
            operation=OP_FLOORPLAN_EXTRACT,
            model=access.model,
            latency_ms=int((time.monotonic() - t0) * 1000),
            status="error",
            client_id=uuid.UUID(client_id),
            raw_input_hash=raw_hash,
            prompt_version=FLOORPLAN_PROMPT_VERSION,
        )
        logger.exception("Floor plan extraction failed")
        raise HTTPException(
            status_code=502,
            detail="Couldn't read the plan — try a clearer image.",
        )

    read_rooms = [FloorPlanRoomOut(**r.model_dump()) for r in extraction.rooms]
    existing_rooms = list(
        dict.fromkeys(i.room for i in quoted_items(db, client_id))
    )
    rooms = match_rooms(read_rooms, existing_rooms)
    if extraction.unreadable or not rooms:
        status, warnings = "unreadable", []
    else:
        status = "success"
        warnings = [w for r in rooms for w in room_warnings(r)]

    log = log_ai_usage(
        db,
        operation=OP_FLOORPLAN_EXTRACT,
        model=access.model,
        input_tokens=tokens_in,
        output_tokens=tokens_out,
        latency_ms=int((time.monotonic() - t0) * 1000),
        status=status,
        client_id=uuid.UUID(client_id),
        raw_input_hash=raw_hash,
        prompt_version=FLOORPLAN_PROMPT_VERSION,
        guard_flags=[
            {"code": "room_check", "severity": "warn", "message": w}
            for w in warnings
        ],
        proposed_output={"rooms": [r.model_dump() for r in read_rooms]},
    )
    if status == "unreadable":
        raise HTTPException(
            status_code=422,
            detail="That doesn't look like a readable floor plan.",
        )
    return FloorPlanExtractResponse(
        source_image_path=store_floorplan_image(client_id, image, ext),
        audit_log_id=str(log.id),
        rooms=rooms,
        existing_rooms=existing_rooms,
        warnings=warnings,
        model=access.model,
    )
