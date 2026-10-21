from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    email: str
    role: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)


class AccessStatus(BaseModel):
    """Payment countdown; all-null/false means no limit is set."""

    plan: str = "free"
    expires_at: datetime | None = None
    days_left: int | None = None
    warning_days: int = 7
    expired: bool = False


class UserMe(BaseModel):
    id: UUID
    email: str
    full_name: str | None
    role: str
    must_change_password: bool = False
    business_name: str | None = None
    access: AccessStatus = Field(default_factory=AccessStatus)
