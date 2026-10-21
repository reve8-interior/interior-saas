from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class CheckpointCreate(BaseModel):
    summary_text: str
    structured_diff: dict[str, Any] = {}
    raw_conversation: str | None = None
    source: str = "manual"
    status: str = "draft"


class CheckpointStatusUpdate(BaseModel):
    status: str


class CheckpointRead(BaseModel):
    id: UUID
    client_id: UUID
    summary_text: str
    structured_diff: dict[str, Any]
    status: str
    source: str
    raw_conversation: str | None
    audio_transcript: str | None
    added_to_quotation: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class FinalSummaryCreate(BaseModel):
    summary_text: str
    checkpoint_id_ref: UUID | None = None
    confirmed_by: str | None = None


class FinalSummaryRead(BaseModel):
    id: UUID
    client_id: UUID
    summary_text: str
    checkpoint_id_ref: UUID | None
    confirmed_by: str | None
    confirmed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
