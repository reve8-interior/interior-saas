import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


Plan = Literal["free", "pro"]


class BusinessCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=50)
    access_expires_at: AwareDatetime | None = None
    warning_days: int = Field(default=7, ge=0, le=365)
    plan: Plan = "free"
    # Team seats (active users); null = unlimited.
    max_users: int | None = Field(default=5, ge=1, le=10_000)
    max_images: int | None = Field(default=50, ge=0, le=100_000)
    max_image_mb: int | None = Field(default=5, ge=1, le=100)
    # Optional first login for the business, so its name shows in their sidebar.
    admin_email: EmailStr | None = None
    admin_password: str | None = Field(default=None, min_length=8)
    admin_name: str | None = Field(default=None, max_length=255)


class BusinessUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=50)
    plan: Plan | None = None
    # Set to null to remove the limit; omit to leave unchanged.
    access_expires_at: AwareDatetime | None = None
    warning_days: int | None = Field(default=None, ge=0, le=365)
    # Set to null to remove the limit; omit to leave unchanged.
    max_users: int | None = Field(default=None, ge=1, le=10_000)
    max_images: int | None = Field(default=None, ge=0, le=100_000)
    max_image_mb: int | None = Field(default=None, ge=1, le=100)


class BusinessRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    contact_email: str | None
    contact_phone: str | None
    is_active: bool
    created_at: datetime
    user_count: int = 0
    access_expires_at: datetime | None = None
    warning_days: int = 7
    plan: str = "free"
    max_users: int | None = None
    seats_used: int = 0
    max_images: int | None = None
    max_image_mb: int | None = None
    image_count: int = 0
    days_left: int | None = None
    access_expired: bool = False
    has_openai_key: bool = False
    openai_key_last4: str | None = None
    openai_key_updated_at: datetime | None = None
    openai_model_economy: str | None = None
    openai_model_balanced: str | None = None
    openai_model_premium: str | None = None
    openai_whisper_model: str | None = None


_MODEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$")


class OpenAISettingsUpdate(BaseModel):
    """Fields left out are unchanged; "" resets a model to the default."""

    api_key: str | None = Field(default=None, max_length=256)
    economy_model: str | None = Field(default=None, max_length=100)
    balanced_model: str | None = Field(default=None, max_length=100)
    premium_model: str | None = Field(default=None, max_length=100)
    whisper_model: str | None = Field(default=None, max_length=100)

    @field_validator("api_key")
    @classmethod
    def _looks_like_openai_key(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if len(v) < 20 or not v.startswith("sk-") or " " in v:
            raise ValueError("Not a valid OpenAI API key (expected sk-...)")
        return v

    @field_validator(
        "economy_model", "balanced_model", "premium_model", "whisper_model"
    )
    @classmethod
    def _valid_model(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if v and not _MODEL_RE.match(v):
            raise ValueError("Invalid model name")
        return v

    @model_validator(mode="after")
    def _something_to_change(self) -> "OpenAISettingsUpdate":
        if all(
            v is None
            for v in (
                self.api_key,
                self.economy_model,
                self.balanced_model,
                self.premium_model,
                self.whisper_model,
            )
        ):
            raise ValueError("Provide api_key and/or at least one model")
        return self
