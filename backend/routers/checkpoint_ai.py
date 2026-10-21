"""
AI-assisted checkpoint creation endpoints.

POST /clients/{client_id}/checkpoints/extract
    Accepts multipart/form-data: optional `file` (text or audio),
    optional `text` field. Returns extracted meeting minutes + line items.

POST /clients/{client_id}/checkpoints/from-extraction
    Persists the confirmed checkpoint with its extracted line items stored
    on the checkpoint (structured_diff) for later verification. The
    quotation is NOT touched here.

POST /clients/{client_id}/quotation/update-items
    Adds a checkpoint's verified items to the quotation (merge, not
    append). Checkpoints must be added in chronological order: the call
    is rejected while an older checkpoint with items is still pending.

POST /clients/{client_id}/quotation/remove-checkpoint/{checkpoint_id}
    Undoes a checkpoint's contribution (LIFO — newest applied first) by
    restoring the snapshot taken before it was added.

POST /quotations/{quotation_id}/revert/{checkpoint_id}
    Restores quotation line items from the snapshot saved for that checkpoint.
"""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session

from ..agents.checkpoint_agent import run_checkpoint_extraction
from ..core import get_db
from ..models.agent_audit_log import AgentAuditLog
from ..models.checkpoint import Checkpoint, CheckpointSource
from ..models.material import MaterialRate
from ..models.quotation import Quotation
from ..models.quotation_line_item import QuotationLineItem
from ..models.user import User
from ..services.ai_access import (
    OP_AUDIO_TRANSCRIBE,
    OP_CHECKPOINT_EXTRACT,
    log_ai_usage,
    resolve_chat_model,
    resolve_openai_access,
)
from ..services.ai_models import (
    ModelCatalog,
    ModelOption,
    ModelTier,
    model_catalog,
    model_options,
)
from ..services.checkpoint_merge import merge_checkpoint_items
from ..services.client_access import get_client_or_404
from ..services.column_settings import (
    get_line_item_columns,
    missing_required_problems,
)
from ..services.extraction_postprocess import (
    NormalizedItem,
    normalize_extraction,
)
from ..services.quotation_context import build_scope_context
from ..services.quotation_service import resolve_line_item
from ..services.transcription import transcribe_audio
from .deps import get_current_user, require_superadmin

router = APIRouter()
logger = logging.getLogger(__name__)

_AUDIO_MIME_PREFIXES = ("audio/", "video/")

# Required quotation columns — all must be non-empty per line item

# ── Request / response schemas ────────────────────────────────────────────────


class ExtractedLineItemOut(BaseModel):
    # What the client did to the quotation: add new work, change an
    # existing item, or drop one. Drives merge behaviour downstream.
    action: str
    # The live quotation line item this row edits (null for new work).
    target_item_id: str | None
    # Human-readable summary of the item as it stands today, shown next
    # to an update so the verifier can see what is changing.
    target_summary: str | None
    room: str
    description: str
    unit: str | None
    raw_dimension: str | None
    qty: float | None
    rate: float | None
    est_time: str | None
    remarks: str | None


class MaterialHint(BaseModel):
    name: str
    category: str
    unit: str
    unit_cost: float


class ExtractionScopeOut(BaseModel):
    """What slice of the quotation the agent was actually shown."""

    total_items: int
    items_in_context: int
    matched_rooms: list[str]


class ExtractionResponse(BaseModel):
    audit_log_id: str
    transcript: str
    meeting_minutes: list[str]
    line_items: list[ExtractedLineItemOut]
    client_budget: float | None
    material_hints: list[MaterialHint]
    # Scope-relevant statements the agent could not turn into an item.
    unmapped_notes: list[str]
    # Deterministic corrections applied after the model returned.
    warnings: list[str]
    scope: ExtractionScopeOut
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    cost_usd: float | None


class ConfirmLineItem(BaseModel):
    room: str
    description: str
    # May be blank when the agent had no basis for a unit; whether that
    # blocks the save is decided by missing_required_problems.
    unit: str = ""
    raw_dimension: str | None = None
    qty: float | None = None
    rate: float | None = None
    est_time: str | None = None
    remarks: str | None = None
    catalog_type: str = "core_works"
    action: str = "add"
    target_item_id: str | None = None
    # Values for user-defined custom columns (services.column_settings)
    extra: dict[str, str | float | None] = Field(default_factory=dict)

    # Which columns are mandatory is user-configurable (see
    # services.column_settings) and checked via missing_required_problems
    # — here we only normalize whitespace so blanks are detectable.
    @field_validator("room", "description", "unit", mode="before")
    @classmethod
    def strip_whitespace(cls, v: object) -> object:
        if v is None:
            return ""
        return v.strip() if isinstance(v, str) else v

    @field_validator("action", mode="before")
    @classmethod
    def known_action(cls, v: object) -> str:
        action = str(v or "add").strip().lower()
        return action if action in ("add", "update", "remove") else "add"


class FromExtractionRequest(BaseModel):
    audit_log_id: str
    summary_text: str
    raw_transcript: str
    audio_transcript: str | None = None
    line_items: list[ConfirmLineItem]
    client_budget: float | None = None
    unmapped_notes: list[str] = Field(default_factory=list)
    # The tier the extraction ran on, for the provenance stamp.
    tier: ModelTier | None = None
    # kept for API compat; ignored — we always upsert
    create_quotation: bool = True


class FromExtractionResponse(BaseModel):
    checkpoint_id: str
    quotation_id: str | None
    # how the quotation was handled
    quotation_action: str  # "created" | "updated" | "none"
    items_added: int = 0
    items_updated: int = 0


class RevertResponse(BaseModel):
    quotation_id: str
    reverted_to_checkpoint_id: str
    items_restored: int


class RemoveCheckpointResponse(BaseModel):
    quotation_id: str
    checkpoint_id: str
    items_restored: int


class UpdateQuotationItemsRequest(BaseModel):
    checkpoint_id: str
    line_items: list[ConfirmLineItem]


class UpdateQuotationItemsResponse(BaseModel):
    quotation_id: str
    action: str  # "created" | "updated"
    items_count: int
    items_added: int = 0
    items_updated: int = 0
    items_removed: int = 0


# ── Helpers ───────────────────────────────────────────────────────────────────


def _restore_snapshot_items(
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


def _extraction_record(
    *,
    item_count: int,
    model_name: str,
    unmapped_notes: list[str],
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
    }


def _blocks_addition(cp: Checkpoint) -> bool:
    """Whether a pending (not added) checkpoint blocks newer additions.

    - Items stored on the checkpoint: blocks iff the list is non-empty
      (a minutes-only checkpoint never blocks).
    - Extraction ran and produced nothing: never blocks. There is
      nothing to add, so holding up later checkpoints would deadlock
      the queue on a meeting that changed no billable work.
    - Legacy ai_extract checkpoints saved before items were stored on
      them: blocks — their items are unknown until re-extracted, so
      skipping them silently would break the old→new ordering.
    """
    diff = cp.structured_diff or {}
    if "line_items" in diff:
        return bool(diff["line_items"])
    if "extraction" in diff:
        return False
    return cp.source == CheckpointSource.ai_extract


def _item_summary(item: QuotationLineItem) -> str:
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


def _material_hints(
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


def _write_audit_log(
    db: Session,
    *,
    client_id: str,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: int,
    status: str,
    raw_hash: str,
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
    )


def _snapshot_line_items(quotation: Quotation, checkpoint_id: str) -> None:
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


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/ai/models", response_model=list[ModelOption])
async def list_ai_models(
    current_user: User = Depends(get_current_user),
) -> list[ModelOption]:
    """The price tiers the caller's business offers, cheapest first."""
    return model_options(current_user.business)


@router.get("/ai/model-catalog", response_model=ModelCatalog)
async def get_model_catalog(
    _admin: User = Depends(require_superadmin),
) -> ModelCatalog:
    """Priced models the platform admin can assign to a tier."""
    return model_catalog()


@router.post(
    "/clients/{client_id}/checkpoints/extract",
    response_model=ExtractionResponse,
)
async def extract_checkpoint(
    client_id: str,
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    tier: ModelTier | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Step 1 — run the PydanticAI agent on uploaded text/audio or pasted text.

    `tier` picks the price tier (economy/balanced/premium); the model
    behind it is the business's, set by the platform admin.
    Returns extracted meeting minutes, line items, and material rate hints.
    Every call is recorded in agent_audit_log.
    """
    get_client_or_404(client_id, db, current_user)

    access = resolve_openai_access(current_user, tier)
    api_key = access.api_key

    audio_transcript: str | None = None

    if file and file.filename:
        raw_bytes = await file.read()
        mime = file.content_type or ""
        if any(mime.startswith(p) for p in _AUDIO_MIME_PREFIXES):
            t_audio = time.monotonic()
            try:
                transcription = await transcribe_audio(
                    raw_bytes, file.filename, api_key, access.whisper_model
                )
            except RuntimeError as exc:
                log_ai_usage(
                    db,
                    operation=OP_AUDIO_TRANSCRIBE,
                    model=access.whisper_model,
                    latency_ms=int((time.monotonic() - t_audio) * 1000),
                    status="error",
                    client_id=uuid.UUID(client_id),
                )
                raise HTTPException(status_code=502, detail=str(exc))
            audio_transcript = transcription.text
            log_ai_usage(
                db,
                operation=OP_AUDIO_TRANSCRIBE,
                model=access.whisper_model,
                latency_ms=int((time.monotonic() - t_audio) * 1000),
                status="success",
                audio_seconds=transcription.duration_seconds,
                client_id=uuid.UUID(client_id),
            )
            transcript = audio_transcript
        else:
            try:
                transcript = raw_bytes.decode("utf-8")
            except UnicodeDecodeError:
                transcript = raw_bytes.decode("latin-1")
    elif text:
        transcript = text
    else:
        raise HTTPException(
            status_code=422,
            detail="Provide either a file upload or a 'text' form field.",
        )

    raw_hash = hashlib.sha256(transcript.encode()).hexdigest()
    model_name = access.model

    # Existing quotation scope. Only the slice of it this transcript
    # appears to talk about is sent to the agent: a mature quotation is
    # 70+ rows, and handing over all of them buries the two the client
    # actually mentioned. Selection is deterministic — see
    # services.quotation_context.
    existing_quotation: Quotation | None = (
        db.execute(
            select(Quotation).where(
                Quotation.client_id == uuid.UUID(client_id)
            )
        )
        .scalars()
        .first()
    )
    existing_items = (
        list(existing_quotation.line_items) if existing_quotation else []
    )
    scope = build_scope_context(transcript, existing_items)

    t0 = time.monotonic()
    try:
        (
            extraction,
            input_tokens,
            output_tokens,
        ) = await run_checkpoint_extraction(
            transcript, api_key=api_key, model=model_name, scope=scope
        )
        status = "success"
    except Exception:
        latency_ms = int((time.monotonic() - t0) * 1000)
        _write_audit_log(
            db,
            client_id=client_id,
            model_name=model_name,
            input_tokens=0,
            output_tokens=0,
            latency_ms=latency_ms,
            status="error",
            raw_hash=raw_hash,
        )
        logger.exception("Checkpoint extraction failed")
        raise HTTPException(
            status_code=502,
            detail=(
                "Extraction failed — the AI service was unavailable or "
                "returned an unusable answer. Try again, or paste a "
                "shorter section."
            ),
        )

    latency_ms = int((time.monotonic() - t0) * 1000)
    log = _write_audit_log(
        db,
        client_id=client_id,
        model_name=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        status=status,
        raw_hash=raw_hash,
    )

    # Everything the model got wrong that a rule can fix is fixed here,
    # before a human ever sees the rows: refs resolved to real ids, room
    # names snapped onto the quotation's own, units normalized,
    # duplicates folded. Corrections surface as `warnings`.
    normalized = normalize_extraction(extraction, scope, existing_items)
    summaries = {str(li.id): _item_summary(li) for li in existing_items}
    hints = _material_hints(normalized.line_items, db)

    return ExtractionResponse(
        audit_log_id=str(log.id),
        transcript=transcript,
        meeting_minutes=normalized.meeting_minutes,
        line_items=[
            ExtractedLineItemOut(
                action=li.action,
                target_item_id=li.target_item_id,
                target_summary=summaries.get(li.target_item_id or ""),
                room=li.room,
                description=li.description,
                unit=li.unit,
                raw_dimension=li.raw_dimension,
                qty=li.qty,
                rate=li.rate,
                est_time=li.est_time,
                remarks=li.remarks,
            )
            for li in normalized.line_items
        ],
        client_budget=normalized.client_budget,
        material_hints=hints,
        unmapped_notes=normalized.unmapped_notes,
        warnings=normalized.warnings,
        scope=ExtractionScopeOut(
            total_items=scope.total_items,
            items_in_context=len(scope.items),
            matched_rooms=scope.matched_rooms,
        ),
        model=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        cost_usd=float(log.cost_usd) if log.cost_usd is not None else None,
    )


@router.post(
    "/clients/{client_id}/checkpoints/from-extraction",
    response_model=FromExtractionResponse,
    status_code=201,
)
def save_from_extraction(
    client_id: str,
    body: FromExtractionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Step 2 — persist the confirmed checkpoint.

    Line items are stored on the checkpoint (structured_diff) as
    unverified. The quotation is intentionally NOT updated here: items
    reach it only via the explicit verify → add flow (update-items),
    which enforces chronological checkpoint order.
    """
    get_client_or_404(client_id, db, current_user)

    # Validate all mandatory columns (user-configurable) before the DB.
    # A removal carries no measurements — it only names what to drop.
    problems = missing_required_problems(
        [li for li in body.line_items if li.action != "remove"],
        get_line_item_columns(db),
    )
    if problems:
        raise HTTPException(
            status_code=422,
            detail="Items missing mandatory columns — " + "; ".join(problems),
        )

    checkpoint = Checkpoint(
        client_id=uuid.UUID(client_id),
        summary_text=body.summary_text,
        structured_diff={
            "line_items": [
                {**li.model_dump(), "verified": False}
                for li in body.line_items
            ],
            "extraction": _extraction_record(
                item_count=len(body.line_items),
                model_name=resolve_chat_model(current_user, body.tier),
                unmapped_notes=body.unmapped_notes,
            ),
        },
        raw_conversation=body.raw_transcript,
        audio_transcript=body.audio_transcript,
        source=CheckpointSource.ai_extract,
        status="draft",
    )
    db.add(checkpoint)
    db.commit()
    db.refresh(checkpoint)

    return FromExtractionResponse(
        checkpoint_id=str(checkpoint.id),
        quotation_id=None,
        quotation_action="none",
        items_added=0,
        items_updated=0,
    )


@router.post(
    "/quotations/{quotation_id}/revert/{checkpoint_id}",
    response_model=RevertResponse,
)
def revert_quotation_to_checkpoint(
    quotation_id: str,
    checkpoint_id: str,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Restore quotation line items from the snapshot saved for checkpoint_id.

    The current state is itself snapshotted first (tagged 'pre-revert') so
    the revert itself is reversible.
    """
    quotation: Quotation | None = (
        db.execute(
            select(Quotation).where(Quotation.id == uuid.UUID(quotation_id))
        )
        .scalars()
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")

    snapshots: list[dict] = list(quotation.snapshots or [])
    target = next(
        (s for s in snapshots if s.get("checkpoint_id") == checkpoint_id),
        None,
    )
    if not target:
        raise HTTPException(
            status_code=404,
            detail=f"No snapshot found for checkpoint {checkpoint_id}",
        )

    # Clear added_to_quotation on the checkpoint whose items we're replacing
    prev_checkpoint_id = quotation.checkpoint_id
    if prev_checkpoint_id and str(prev_checkpoint_id) != checkpoint_id:
        prev_cp: Checkpoint | None = (
            db.execute(
                select(Checkpoint).where(Checkpoint.id == prev_checkpoint_id)
            )
            .scalars()
            .first()
        )
        if prev_cp:
            prev_cp.added_to_quotation = False  # type: ignore[assignment]

    items_restored = _restore_snapshot_items(quotation, target, db)

    # Remove this snapshot from history (revert = undo that state)
    quotation.snapshots = [
        s for s in snapshots if s.get("checkpoint_id") != checkpoint_id
    ]
    quotation.checkpoint_id = uuid.UUID(checkpoint_id)  # type: ignore[assignment]

    # Mark the reverted-to checkpoint as no longer added
    reverted_cp: Checkpoint | None = (
        db.execute(
            select(Checkpoint).where(Checkpoint.id == uuid.UUID(checkpoint_id))
        )
        .scalars()
        .first()
    )
    if reverted_cp:
        reverted_cp.added_to_quotation = False  # type: ignore[assignment]

    db.commit()
    db.refresh(quotation)

    return RevertResponse(
        quotation_id=str(quotation.id),
        reverted_to_checkpoint_id=checkpoint_id,
        items_restored=items_restored,
    )


@router.post(
    "/clients/{client_id}/quotation/remove-checkpoint/{checkpoint_id}",
    response_model=RemoveCheckpointResponse,
)
def remove_checkpoint_from_quotation(
    client_id: str,
    checkpoint_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Undo a checkpoint's contribution to the quotation.

    Restores the snapshot taken just before the checkpoint was applied
    and clears its added_to_quotation flag, so it can be re-verified and
    re-added. Removal is LIFO — the mirror of the old→new add rule: a
    checkpoint can only be removed while no NEWER checkpoint is still on
    the quotation, so intermediate states stay consistent.
    """
    get_client_or_404(client_id, db, current_user)

    checkpoint: Checkpoint | None = (
        db.execute(
            select(Checkpoint).where(Checkpoint.id == uuid.UUID(checkpoint_id))
        )
        .scalars()
        .first()
    )
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    if not checkpoint.added_to_quotation:
        raise HTTPException(
            status_code=409,
            detail="This checkpoint is not on the quotation.",
        )

    newer_added: Checkpoint | None = (
        db.execute(
            select(Checkpoint)
            .where(
                Checkpoint.client_id == uuid.UUID(client_id),
                Checkpoint.added_to_quotation.is_(True),
                tuple_(Checkpoint.created_at, Checkpoint.id)
                > tuple_(checkpoint.created_at, checkpoint.id),
            )
            .order_by(Checkpoint.created_at.asc(), Checkpoint.id.asc())
        )
        .scalars()
        .first()
    )
    if newer_added is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "Remove newer checkpoints first (new → old): the "
                f"checkpoint from {newer_added.created_at:%d %b %Y, %H:%M} "
                "was added after this one."
            ),
        )

    quotation: Quotation | None = (
        db.execute(
            select(Quotation).where(
                Quotation.client_id == uuid.UUID(client_id)
            )
        )
        .scalars()
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="No quotation found")

    snapshots: list[dict] = list(quotation.snapshots or [])
    indices = [
        i
        for i, s in enumerate(snapshots)
        if s.get("checkpoint_id") == checkpoint_id
    ]
    if indices:
        # Restore the state captured just before this checkpoint applied
        idx = indices[-1]
        items_restored = _restore_snapshot_items(quotation, snapshots[idx], db)
        quotation.snapshots = snapshots[:idx] + snapshots[idx + 1 :]
    else:
        # Legacy (no snapshot recorded): drop only this checkpoint's items
        for li in list(quotation.line_items):
            if li.source_checkpoint_id == checkpoint.id:
                db.delete(li)
        db.flush()
        items_restored = 0

    checkpoint.added_to_quotation = False  # type: ignore[assignment]

    # Re-point the quotation at the newest checkpoint still applied
    last_added: Checkpoint | None = (
        db.execute(
            select(Checkpoint)
            .where(
                Checkpoint.client_id == uuid.UUID(client_id),
                Checkpoint.added_to_quotation.is_(True),
            )
            .order_by(Checkpoint.created_at.desc(), Checkpoint.id.desc())
        )
        .scalars()
        .first()
    )
    quotation.checkpoint_id = last_added.id if last_added else None  # type: ignore[assignment]

    db.commit()

    return RemoveCheckpointResponse(
        quotation_id=str(quotation.id),
        checkpoint_id=checkpoint_id,
        items_restored=items_restored,
    )


@router.post(
    "/clients/{client_id}/quotation/update-items",
    response_model=UpdateQuotationItemsResponse,
)
def update_quotation_items(
    client_id: str,
    body: UpdateQuotationItemsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the client's quotation with verified items from a checkpoint.

    Does NOT create a new checkpoint entry — only updates the quotation and
    marks the source checkpoint as added_to_quotation=True.

    Checkpoints must be added in chronological order: rejected with 409
    while an OLDER checkpoint that has extracted items is still pending
    (added_to_quotation=False), so the quotation history stays linear.
    """
    get_client_or_404(client_id, db, current_user)

    # Removals name an existing item rather than describing one, so the
    # mandatory-column rules do not apply to them.
    problems = missing_required_problems(
        [li for li in body.line_items if li.action != "remove"],
        get_line_item_columns(db),
    )
    if problems:
        raise HTTPException(
            status_code=422,
            detail="Items missing mandatory columns — " + "; ".join(problems),
        )

    checkpoint: Checkpoint | None = (
        db.execute(
            select(Checkpoint).where(
                Checkpoint.id == uuid.UUID(body.checkpoint_id)
            )
        )
        .scalars()
        .first()
    )
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    # Enforce old→new order: every older checkpoint that produced line
    # items must already be on the quotation before this one can be added.
    # Ordering compares (created_at, id) so checkpoints created within
    # the same microsecond still order deterministically.
    older_checkpoints = (
        db.execute(
            select(Checkpoint)
            .where(
                Checkpoint.client_id == uuid.UUID(client_id),
                Checkpoint.added_to_quotation.is_(False),
                tuple_(Checkpoint.created_at, Checkpoint.id)
                < tuple_(checkpoint.created_at, checkpoint.id),
            )
            .order_by(Checkpoint.created_at.asc(), Checkpoint.id.asc())
        )
        .scalars()
        .all()
    )
    blocking = next(
        (cp for cp in older_checkpoints if _blocks_addition(cp)),
        None,
    )
    if blocking is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "Checkpoints must be added to the quotation in order: the "
                f"checkpoint from {blocking.created_at:%d %b %Y, %H:%M} is "
                "still pending. Verify and add it first."
            ),
        )

    existing_quotation: Quotation | None = (
        db.execute(
            select(Quotation).where(
                Quotation.client_id == uuid.UUID(client_id)
            )
        )
        .scalars()
        .first()
    )

    cp_uuid = uuid.UUID(body.checkpoint_id)

    if existing_quotation:
        _snapshot_line_items(existing_quotation, body.checkpoint_id)
        merge = merge_checkpoint_items(
            existing_quotation, cp_uuid, list(body.line_items), db
        )
        existing_quotation.checkpoint_id = cp_uuid  # type: ignore[assignment]
        action = "updated"
        quotation_id = str(existing_quotation.id)
    else:
        quotation = Quotation(
            client_id=uuid.UUID(client_id),
            checkpoint_id=cp_uuid,
            snapshots=[],
        )
        db.add(quotation)
        db.flush()
        # Snapshot the empty starting state so the first checkpoint has
        # a history entry too (visible in What Changed, removable LIFO).
        _snapshot_line_items(quotation, body.checkpoint_id)
        merge = merge_checkpoint_items(
            quotation, cp_uuid, list(body.line_items), db
        )
        action = "created"
        quotation_id = str(quotation.id)

    checkpoint.added_to_quotation = True  # type: ignore[assignment]

    db.commit()

    return UpdateQuotationItemsResponse(
        quotation_id=quotation_id,
        action=action,
        items_count=len(body.line_items),
        items_added=merge.added,
        items_updated=merge.updated,
        items_removed=merge.marked_removed,
    )
