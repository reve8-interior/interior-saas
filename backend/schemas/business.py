import re
from datetime import datetime
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

from .plan import PlanLimits, UsageMeter

_SLUG_RE = re.compile(r"^[a-z][a-z0-9_]{1,31}$")


class BusinessCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=50)
    access_expires_at: AwareDatetime | None = None
    warning_days: int = Field(default=7, ge=0, le=365)
    # Slug of a plan (see /admin/plans); validated against the table.
    plan: str = Field(default="free", pattern=_SLUG_RE.pattern)
    ai_credit_bonus: int = Field(default=0, ge=0, le=100_000)
    # Per-business overrides of the plan; null follows the plan.
    max_users: int | None = Field(default=None, ge=1, le=10_000)
    max_images: int | None = Field(default=None, ge=0, le=100_000)
    max_image_mb: int | None = Field(default=None, ge=1, le=100)
    max_clients: int | None = Field(default=None, ge=0, le=100_000)
    max_quotation_versions: int | None = Field(default=None, ge=0, le=1000)
    max_portfolio_designs: int | None = Field(default=None, ge=0, le=100_000)
    # First login for the business. Leave the password empty to have one generated.
    admin_email: EmailStr | None = None
    admin_password: str | None = Field(default=None, min_length=8)
    admin_name: str | None = Field(default=None, max_length=255)


class BusinessUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=50)
    plan: str | None = Field(default=None, pattern=_SLUG_RE.pattern)
    ai_credit_bonus: int | None = Field(default=None, ge=0, le=100_000)
    # Set to null to remove the limit; omit to leave unchanged.
    access_expires_at: AwareDatetime | None = None
    warning_days: int | None = Field(default=None, ge=0, le=365)
    # Per-business overrides of the plan; null clears one (follow the plan),
    # omit to leave unchanged.
    max_users: int | None = Field(default=None, ge=1, le=10_000)
    max_images: int | None = Field(default=None, ge=0, le=100_000)
    max_image_mb: int | None = Field(default=None, ge=1, le=100)
    max_clients: int | None = Field(default=None, ge=0, le=100_000)
    max_quotation_versions: int | None = Field(default=None, ge=0, le=1000)
    max_portfolio_designs: int | None = Field(default=None, ge=0, le=100_000)


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
    plan_name: str = "Free"
    ai_credit_bonus: int = 0
    # Overrides set on this business (null = follows the plan).
    max_users: int | None = None
    max_images: int | None = None
    max_image_mb: int | None = None
    max_clients: int | None = None
    max_quotation_versions: int | None = None
    max_portfolio_designs: int | None = None
    # What actually applies: overrides over the plan.
    limits: PlanLimits | None = None
    usage: list[UsageMeter] = []
    seats_used: int = 0
    image_count: int = 0
    days_left: int | None = None
    access_expired: bool = False
    has_openai_key: bool = False
    # Only set on create, once, when the system generated the admin password.
    temporary_password: str | None = None
    openai_key_last4: str | None = None
    openai_key_updated_at: datetime | None = None
    openai_chat_model: str | None = None
    openai_whisper_model: str | None = None


_MODEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$")


class OpenAISettingsUpdate(BaseModel):
    """Fields left out are unchanged; "" resets a model to the default."""

    api_key: str | None = Field(default=None, max_length=256)
    chat_model: str | None = Field(default=None, max_length=100)
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

    @field_validator("chat_model", "whisper_model")
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
                self.chat_model,
                self.whisper_model,
            )
        ):
            raise ValueError("Provide api_key and/or at least one model")
        return self
