import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

_SLUG_RE = re.compile(r"^[a-z][a-z0-9_]{1,31}$")

# Optional counts: null = unlimited.
_Limit = Field(default=None, ge=0, le=10_000_000)


class PlanFields(BaseModel):
    """Everything an admin can edit on a plan."""

    name: str = Field(min_length=1, max_length=64)
    tagline: str | None = Field(default=None, max_length=255)
    is_public: bool = True
    is_recommended: bool = False
    sort_order: int = Field(default=0, ge=0, le=1000)

    price_monthly_inr: int | None = Field(default=None, ge=0, le=1_000_000)
    price_yearly_inr: int | None = Field(default=None, ge=0, le=10_000_000)

    max_users: int | None = _Limit
    max_clients: int | None = _Limit
    max_quotation_versions: int | None = _Limit
    max_images: int | None = _Limit
    max_image_mb: int | None = Field(default=None, ge=1, le=100)
    max_portfolio_designs: int | None = _Limit
    ai_credits_monthly: int | None = _Limit

    clean_export: bool = False
    branded_export: bool = False
    bulk_materials_import: bool = False
    priority_support: bool = False

    website_enabled: bool = False
    website_templates: int = Field(default=0, ge=0, le=100)
    website_max_pages: int = Field(default=0, ge=0, le=20)
    website_custom_domain: bool = False
    website_remove_badge: bool = False

    highlights: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("highlights")
    @classmethod
    def _short_highlights(cls, v: list[str]) -> list[str]:
        cleaned = [item.strip() for item in v if item.strip()]
        if any(len(item) > 120 for item in cleaned):
            raise ValueError("Each highlight must be 120 characters or fewer")
        return cleaned


class PlanCreate(PlanFields):
    slug: str

    @field_validator("slug")
    @classmethod
    def _valid_slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not _SLUG_RE.match(v):
            raise ValueError(
                "Slug must be 2-32 characters: lowercase letters, digits, _"
            )
        return v


class PlanUpdate(BaseModel):
    """Fields left out stay unchanged; null clears a limit (unlimited)."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=64)
    tagline: str | None = Field(default=None, max_length=255)
    is_public: bool | None = None
    is_recommended: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=1000)
    price_monthly_inr: int | None = Field(default=None, ge=0, le=1_000_000)
    price_yearly_inr: int | None = Field(default=None, ge=0, le=10_000_000)
    max_users: int | None = _Limit
    max_clients: int | None = _Limit
    max_quotation_versions: int | None = _Limit
    max_images: int | None = _Limit
    max_image_mb: int | None = Field(default=None, ge=1, le=100)
    max_portfolio_designs: int | None = _Limit
    ai_credits_monthly: int | None = _Limit
    clean_export: bool | None = None
    branded_export: bool | None = None
    bulk_materials_import: bool | None = None
    priority_support: bool | None = None
    website_enabled: bool | None = None
    website_templates: int | None = Field(default=None, ge=0, le=100)
    website_max_pages: int | None = Field(default=None, ge=0, le=20)
    website_custom_domain: bool | None = None
    website_remove_badge: bool | None = None
    highlights: list[str] | None = Field(default=None, max_length=12)


class PlanRead(PlanFields):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    created_at: datetime | None = None


class PublicPlan(BaseModel):
    """What the landing page may show: no admin-only fields."""

    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str
    tagline: str | None
    is_recommended: bool
    price_monthly_inr: int | None
    price_yearly_inr: int | None
    max_users: int | None
    max_clients: int | None
    max_quotation_versions: int | None
    max_images: int | None
    max_portfolio_designs: int | None
    ai_credits_monthly: int | None
    clean_export: bool
    branded_export: bool
    bulk_materials_import: bool
    priority_support: bool
    highlights: list[str]


class UsageMeter(BaseModel):
    """One limit with how much of it a business has used."""

    key: str
    label: str
    used: int
    limit: int | None = None


class PlanLimits(BaseModel):
    """A business's effective limits: its overrides over its plan."""

    plan: str
    plan_name: str
    max_users: int | None
    max_clients: int | None
    max_quotation_versions: int | None
    max_images: int | None
    max_image_mb: int | None
    max_portfolio_designs: int | None
    ai_credits_monthly: int | None
    clean_export: bool
    branded_export: bool
    bulk_materials_import: bool
    priority_support: bool
    website_enabled: bool
    website_templates: int
    website_max_pages: int
    website_custom_domain: bool
    website_remove_badge: bool
