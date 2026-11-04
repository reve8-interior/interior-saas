import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, uuid_pk


class Business(Base, TimestampMixin):
    """An interior design business (a customer of the platform)."""

    __tablename__ = "businesses"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # Slug of the commercial plan (see models.plan.Plan).
    plan: Mapped[str] = mapped_column(
        String(32), nullable=False, default="free", server_default="free"
    )
    # Payment countdown: access ends here (null = no limit).
    access_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    # Show the countdown banner when this many days (or fewer) remain.
    warning_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=7, server_default="7"
    )

    # Per-business overrides set by the platform admin. Null follows the
    # business's plan (services.plan_limits.effective_limits). Only active
    # users use a team seat; the per-image size is also capped globally by
    # MAX_IMAGE_BYTES.
    max_users: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_images: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_image_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_clients: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_quotation_versions: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    max_portfolio_designs: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    # Goodwill AI credits on top of the plan's monthly allowance.
    ai_credit_bonus: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # Encrypted with services.secret_box; never serialized to clients.
    openai_api_key_enc: Mapped[str | None] = mapped_column(Text)
    openai_key_last4: Mapped[str | None] = mapped_column(String(8))
    openai_key_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    # Chat model chosen by the platform admin (see services.ai_models);
    # null = the platform default.
    openai_chat_model: Mapped[str | None] = mapped_column(String(100))
    # Voice transcription model; null = platform default.
    openai_whisper_model: Mapped[str | None] = mapped_column(String(100))

    # Public designer website. slug is the URL handle (null = no site yet).
    slug: Mapped[str | None] = mapped_column(
        String(40), unique=True, index=True
    )
    site_published: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    site_tagline: Mapped[str | None] = mapped_column(String(255))
    site_about: Mapped[str | None] = mapped_column(Text)
    site_address: Mapped[str | None] = mapped_column(String(500))
    # [{title, description}]
    site_services: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    # [{label, url}]
    site_socials: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    logo_path: Mapped[str | None] = mapped_column(String(500))
    hero_path: Mapped[str | None] = mapped_column(String(500))
    hide_badge: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # Key of a preset in schemas.site.SiteTheme (colours + font pairing).
    site_theme: Mapped[str] = mapped_column(
        String(30), nullable=False, default="classic", server_default="classic"
    )

    @property
    def has_openai_key(self) -> bool:
        return bool(self.openai_api_key_enc)

    users: Mapped[list["User"]] = relationship(  # type: ignore[name-defined]
        "User", back_populates="business"
    )
