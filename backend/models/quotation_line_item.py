import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, uuid_pk


class QuotationItemStatus(str, enum.Enum):
    draft = "draft"
    priced = "priced"
    pending_clarity = "pending_clarity"
    agreed = "agreed"
    removed = "removed"


class QuotationCatalogType(str, enum.Enum):
    core_works = "core_works"
    loose_furniture = "loose_furniture"


class QuotationLineItem(Base, TimestampMixin):
    """
    One negotiable line of a quotation, grouped by room.

    Prices are kept as separate columns (initial vs negotiated) because
    quotations are comparative negotiation logs, not single numbers.
    raw_dimension preserves the original string (e.g. 6'3"x1'6") for
    audit; computed_sqft is derived by services.dimension_parser only.
    """

    __tablename__ = "quotation_line_items"

    id: Mapped[object] = uuid_pk()
    quotation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("quotations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    catalog_type: Mapped[str] = mapped_column(
        Enum(QuotationCatalogType, name="quotation_catalog_type"),
        nullable=False,
        default=QuotationCatalogType.core_works,
    )
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    raw_dimension: Mapped[str | None] = mapped_column(String(50))
    computed_sqft: Mapped[float | None] = mapped_column(Numeric(10, 2))
    qty: Mapped[float | None] = mapped_column(Numeric(10, 2))
    rate: Mapped[float | None] = mapped_column(Numeric(12, 2))
    initial_price: Mapped[float | None] = mapped_column(Numeric(14, 2))
    negotiated_price: Mapped[float | None] = mapped_column(Numeric(14, 2))
    # Estimated time to complete, kept verbatim (e.g. "2 weeks", "10 days")
    est_time: Mapped[str | None] = mapped_column(String(50))
    remarks: Mapped[str | None] = mapped_column(String(2000))
    # Values for user-defined custom columns (see services.column_settings)
    extra: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    status: Mapped[str] = mapped_column(
        Enum(QuotationItemStatus, name="quotation_item_status"),
        nullable=False,
        default=QuotationItemStatus.draft,
        index=True,
    )

    # Which checkpoint contributed this item (null = manually added)
    source_checkpoint_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("checkpoints.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Reference to material master data (null = no material selected)
    material_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("materials_rates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    quotation: Mapped["Quotation"] = relationship(  # type: ignore[name-defined]
        "Quotation", back_populates="line_items"
    )
