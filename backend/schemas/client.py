from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class ClientCreate(BaseModel):
    name: str
    contact_info: dict[str, Any] = {}
    assigned_designer_id: UUID | None = None
    notes: str | None = None


class ClientUpdate(BaseModel):
    name: str | None = None
    contact_info: dict[str, Any] | None = None
    assigned_designer_id: UUID | None = None
    notes: str | None = None


class PhaseUpdate(BaseModel):
    phase: str


class DesignerRead(BaseModel):
    id: UUID
    full_name: str | None
    email: str

    model_config = {"from_attributes": True}


class ClientRead(BaseModel):
    id: UUID
    name: str
    contact_info: dict[str, Any]
    assigned_designer_id: UUID | None
    assigned_designer: DesignerRead | None
    current_phase: str
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class ClientAccessRead(BaseModel):
    """Designers who can see a client: its lead plus shared members."""

    lead_id: UUID | None
    member_ids: list[UUID]


class ClientAccessUpdate(BaseModel):
    member_ids: list[UUID]


class MemberClientsRead(BaseModel):
    lead_ids: list[UUID]
    shared_ids: list[UUID]


class MemberClientsUpdate(BaseModel):
    client_ids: list[UUID]
