from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# admin: manages the team; designer: works on assigned clients;
# viewer: read-only.
BusinessRole = Literal["admin", "designer", "viewer"]


class BusinessUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str | None
    role: str
    is_active: bool
    must_change_password: bool
    last_login_at: datetime | None = None
    created_at: datetime


class BusinessUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)
    role: BusinessRole = "designer"


class BusinessUserUpdate(BaseModel):
    """Fields left out are unchanged."""

    email: EmailStr | None = None
    full_name: str | None = Field(default=None, max_length=255)
    role: BusinessRole | None = None
    is_active: bool | None = None


class ResetPasswordRequest(BaseModel):
    """Omit password to have a strong one generated."""

    password: str | None = Field(default=None, min_length=8, max_length=128)


class ResetPasswordResponse(BaseModel):
    """The only time the temporary password is ever shown."""

    temporary_password: str


class TeamOverview(BaseModel):
    """A business's team plus how much of its seat allowance is used."""

    members: list[BusinessUserRead]
    seats_used: int
    # null = unlimited
    max_users: int | None
    seats_left: int | None


class AuditEntryRead(BaseModel):
    id: UUID
    timestamp: datetime
    action: str
    entity_type: str
    entity_id: str | None
    payload: dict
    actor_id: UUID | None
    actor_email: str | None
    actor_name: str | None


class AuditPage(BaseModel):
    items: list[AuditEntryRead]
    total: int
