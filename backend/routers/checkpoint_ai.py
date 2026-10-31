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
    append). Meetings can go in any order; who added it and when is
    recorded on the checkpoint and in the audit log.

POST /clients/{client_id}/quotation/remove-checkpoint/{checkpoint_id}
    Undoes a checkpoint's contribution (newest added first) by restoring
    the snapshot taken before it was added.

POST /quotations/{quotation_id}/revert/{checkpoint_id}
    Restores quotation line items from the snapshot saved for that checkpoint.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..core import get_db
from ..models.checkpoint import Checkpoint, CheckpointSource
from ..models.user import User
from ..schemas.checkpoint_ai import (
    ExtractionResponse,
    FromExtractionRequest,
    FromExtractionResponse,
    RemoveCheckpointResponse,
    RevertResponse,
    UpdateQuotationItemsRequest,
    UpdateQuotationItemsResponse,
)
from ..services.ai_access import (
    resolve_chat_model,
)
from ..services.ai_models import (
    ModelCatalog,
    ModelOption,
    ModelTier,
    model_catalog,
    model_options,
)
from ..services.checkpoint_ai_support import (
    extraction_record,
)
from ..services.checkpoint_extraction import (
    Upload,
    extract_checkpoint_from_input,
)
from ..services.checkpoint_quotation import (
    add_checkpoint_to_quotation,
    remove_checkpoint,
    revert_to_checkpoint,
)
from ..services.client_access import get_client_or_404
from ..services.column_settings import (
    get_line_item_columns,
    missing_required_problems,
)
from .deps import get_current_user, require_superadmin

router = APIRouter()
logger = logging.getLogger(__name__)


# Required quotation columns — all must be non-empty per line item

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
    upload = None
    if file and file.filename:
        upload = Upload(
            filename=file.filename,
            content_type=file.content_type or "",
            content=await file.read(),
        )
    return await extract_checkpoint_from_input(
        db,
        current_user=current_user,
        client_id=client_id,
        tier=tier,
        upload=upload,
        text=text,
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
    which records who added it and when.
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
            "extraction": extraction_record(
                item_count=len(body.line_items),
                model_name=resolve_chat_model(current_user, body.tier),
                unmapped_notes=body.unmapped_notes,
                questions=[q.model_dump() for q in body.questions],
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
    return revert_to_checkpoint(db, quotation_id, checkpoint_id)


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
    re-added. It can only be undone while nothing was added after it, so
    the quotation never lands in a state it was not in.
    """
    get_client_or_404(client_id, db, current_user)
    return remove_checkpoint(db, client_id, checkpoint_id, current_user)


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

    Meetings can be added in any order. Who added it and when is recorded
    on the checkpoint and in the audit log.
    """
    get_client_or_404(client_id, db, current_user)
    return add_checkpoint_to_quotation(db, client_id, body, current_user)
