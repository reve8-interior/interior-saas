"""n8n webhook endpoint — receives checkpoint payloads from the automation pipeline."""

import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.config import settings
from ..core.logging import logger
from ..models.checkpoint import Checkpoint
from ..models.client import Client
from ..schemas.n8n import N8nCheckpointPayload

router = APIRouter()


def _verify_n8n_secret(
    x_webhook_secret: str | None = Header(default=None),
) -> None:
    if x_webhook_secret != settings.n8n_webhook_secret:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")


@router.post("/checkpoint", status_code=201)
def receive_checkpoint(
    body: N8nCheckpointPayload,
    db: Session = Depends(get_db),
    _: None = Depends(_verify_n8n_secret),
):
    client = (
        db.execute(
            select(Client).where(Client.id == uuid.UUID(body.client_id))
        )
        .scalars()
        .first()
    )
    if not client:
        raise HTTPException(
            status_code=404, detail=f"Client {body.client_id} not found"
        )

    checkpoint = Checkpoint(
        client_id=uuid.UUID(body.client_id),
        summary_text=body.summary_text,
        structured_diff=body.structured_diff,
        raw_conversation=body.raw_conversation,
        source="chat",
        status=body.status,
    )
    db.add(checkpoint)
    db.commit()
    db.refresh(checkpoint)
    logger.info(
        "n8n_checkpoint_received",
        client_id=body.client_id,
        checkpoint_id=str(checkpoint.id),
    )
    return {"id": str(checkpoint.id), "status": "created"}
