"""Step 1 of AI checkpoint creation: transcribe, extract, normalise, log."""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
from dataclasses import dataclass
from typing import cast

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..agents.checkpoint_agent import run_checkpoint_extraction
from ..agents.prompts.checkpoint_extraction import CHECKPOINT_PROMPT_VERSION
from ..models.quotation import Quotation
from ..models.user import User
from ..schemas.checkpoint_ai import (
    ExtractedLineItemOut,
    ExtractedQuestionOut,
    ExtractionResponse,
    ExtractionScopeOut,
)
from .ai_access import (
    OP_AUDIO_TRANSCRIBE,
    enforce_extraction_quota,
    log_ai_usage,
    resolve_openai_access,
)
from .ai_guards import GuardFlag, check_extracted_items, scan_input
from .checkpoint_ai_support import (
    item_summary,
    material_hints,
    write_audit_log,
)
from .extraction_postprocess import RawExtraction, normalize_extraction
from .quotation_context import build_scope_context
from .transcription import transcribe_audio

logger = logging.getLogger(__name__)

_AUDIO_MIME_PREFIXES = ("audio/", "video/")

# Pasted text and text files only; a whole chat history in one go produces
# slow, costly and muddled extractions. Mirrored in the frontend.
MAX_TEXT_CHARS = 15_000


@dataclass(frozen=True)
class Upload:
    """An uploaded file, already read into memory."""

    filename: str
    content_type: str
    content: bytes


async def extract_checkpoint_from_input(
    db: Session,
    *,
    current_user: User,
    client_id: str,
    upload: Upload | None,
    text: str | None,
) -> ExtractionResponse:
    """Run the extraction agent on an upload (text or audio) or pasted text.

    Every attempt is recorded in the AI usage log; provider errors are
    reported as a generic 502 and never forwarded to the client.
    """
    access = resolve_openai_access(current_user)
    enforce_extraction_quota(db, current_user)
    api_key = access.api_key

    audio_transcript: str | None = None

    if upload is not None:
        raw_bytes = upload.content
        mime = upload.content_type
        if any(mime.startswith(p) for p in _AUDIO_MIME_PREFIXES):
            t_audio = time.monotonic()
            try:
                transcription = await transcribe_audio(
                    raw_bytes, upload.filename, api_key, access.whisper_model
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

    if audio_transcript is None and len(transcript) > MAX_TEXT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=(
                f"That is {len(transcript):,} characters; the limit is "
                f"{MAX_TEXT_CHARS:,}. Add the notes in smaller parts."
            ),
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

    input_flags = scan_input(transcript)
    if input_flags:
        logger.warning("ai_input_flagged", extra={"client_id": client_id})

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
        write_audit_log(
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

    # Everything the model got wrong that a rule can fix is fixed here,
    # before a human ever sees the rows: refs resolved to real ids, room
    # names snapped onto the quotation's own, units normalized,
    # duplicates folded. Corrections surface as `warnings`.
    normalized = normalize_extraction(
        cast(RawExtraction, extraction), scope, existing_items, transcript
    )
    summaries = {str(li.id): item_summary(li) for li in existing_items}
    hints = material_hints(normalized.line_items, db)

    flags: list[GuardFlag] = input_flags + check_extracted_items(
        normalized.line_items, transcript=transcript, existing=existing_items
    )
    proposed = [
        {
            "action": li.action,
            "target_item_id": li.target_item_id,
            "room": li.room,
            "description": li.description,
            "unit": li.unit,
            "raw_dimension": li.raw_dimension,
            "qty": li.qty,
            "rate": li.rate,
        }
        for li in normalized.line_items
    ]
    log = write_audit_log(
        db,
        client_id=client_id,
        model_name=model_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        status=status,
        raw_hash=raw_hash,
        prompt_version=CHECKPOINT_PROMPT_VERSION,
        guard_flags=[f.to_dict() for f in flags],
        proposed_output={"line_items": proposed},
    )

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
                agreed_price=li.agreed_price,
            )
            for li in normalized.line_items
        ],
        client_budget=normalized.client_budget,
        material_hints=hints,
        unmapped_notes=normalized.unmapped_notes,
        warnings=normalized.warnings + [f.message for f in flags],
        questions=[
            ExtractedQuestionOut(
                question=q.question, suggested_note=q.suggested_note
            )
            for q in normalized.questions
        ],
        scope=ExtractionScopeOut(
            total_items=scope.total_items,
            items_in_context=len(scope.items),
            matched_rooms=scope.matched_rooms,
        ),
        model=model_name,
    )
