from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, uuid_pk


class Business(Base, TimestampMixin):
    """An interior design business (a customer of the platform)."""

    __tablename__ = "businesses"

    id: Mapped[object] = uuid_pk()
    name: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # Commercial tier shown to the tenant: free | pro.
    plan: Mapped[str] = mapped_column(
        String(10), nullable=False, default="free", server_default="free"
    )
    # Payment countdown: access ends here (null = no limit).
    access_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    # Show the countdown banner when this many days (or fewer) remain.
    warning_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=7, server_default="7"
    )

    # Team-seat allowance set by the platform admin; null = no limit.
    # Only active users use a seat.
    max_users: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=5, server_default="5"
    )

    # Uploaded-image allowance set by the platform admin; null = no limit
    # (the per-image size is still capped by the global MAX_IMAGE_BYTES).
    max_images: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=50, server_default="50"
    )
    max_image_mb: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=5, server_default="5"
    )

    # Encrypted with services.secret_box; never serialized to clients.
    openai_api_key_enc: Mapped[str | None] = mapped_column(Text)
    openai_key_last4: Mapped[str | None] = mapped_column(String(8))
    openai_key_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    # Chat model per price tier (see services.ai_models); null = the
    # platform default for that tier.
    openai_model_economy: Mapped[str | None] = mapped_column(String(100))
    openai_model_balanced: Mapped[str | None] = mapped_column(String(100))
    openai_model_premium: Mapped[str | None] = mapped_column(String(100))
    # Voice transcription model; null = platform default.
    openai_whisper_model: Mapped[str | None] = mapped_column(String(100))

    @property
    def has_openai_key(self) -> bool:
        return bool(self.openai_api_key_enc)

    users: Mapped[list["User"]] = relationship(  # type: ignore[name-defined]
        "User", back_populates="business"
    )
