import uuid

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, uuid_pk


class Plan(Base, TimestampMixin):
    """A commercial plan; the platform admin edits prices, limits and flags.

    Every limit column is nullable: null means unlimited. Businesses are
    linked by slug (`Business.plan`), and per-business overrides on the
    business row win over these values.
    """

    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    tagline: Mapped[str | None] = mapped_column(String(255))
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    is_recommended: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # Whole INR; null on the free plan.
    price_monthly_inr: Mapped[int | None] = mapped_column(Integer)
    price_yearly_inr: Mapped[int | None] = mapped_column(Integer)

    max_users: Mapped[int | None] = mapped_column(Integer)
    max_clients: Mapped[int | None] = mapped_column(Integer)
    max_quotation_versions: Mapped[int | None] = mapped_column(Integer)
    max_images: Mapped[int | None] = mapped_column(Integer)
    max_image_mb: Mapped[int | None] = mapped_column(Integer)
    max_portfolio_designs: Mapped[int | None] = mapped_column(Integer)
    ai_credits_monthly: Mapped[int | None] = mapped_column(Integer)

    clean_export: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    branded_export: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    bulk_materials_import: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    priority_support: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # Reserved for the website builder; all off until that feature ships.
    website_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    website_templates: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    website_max_pages: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    website_custom_domain: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    website_remove_badge: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # Monthly plan id in Razorpay, and the price it was created at (Razorpay
    # plans are immutable, so a price change needs a new one).
    razorpay_plan_id_monthly: Mapped[str | None] = mapped_column(String(64))
    razorpay_plan_price_inr: Mapped[int | None] = mapped_column(Integer)

    # Marketing bullets for the pricing card.
    highlights: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
