import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Numeric,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, uuid_pk


class DesignSource(str, enum.Enum):
    ai_generated = "ai_generated"
    designer_uploaded = "designer_uploaded"


class Design(Base, TimestampMixin):
    __tablename__ = "designs"

    id: Mapped[object] = uuid_pk()
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source: Mapped[str] = mapped_column(
        Enum(DesignSource, name="design_source"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(255))
    image_url: Mapped[str | None] = mapped_column(String(1000))
    # Object key in storage for uploaded images; wins over image_url.
    storage_path: Mapped[str | None] = mapped_column(String(500))
    # specs_json: {materials: [{name, category, qty, unit}], dimensions: {...},
    # labor_estimate: float}
    specs_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_selected: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str | None] = mapped_column(String(2000))
    # Quotation rooms this image belongs to; pre-selects it when a quotation
    # version is saved.
    rooms: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    # Opt-in: shown on the business's public portfolio page.
    in_portfolio: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    client: Mapped["Client"] = relationship("Client", back_populates="designs")  # type: ignore[name-defined]
    hotspots: Mapped[list["DesignHotspot"]] = relationship(
        "DesignHotspot",
        back_populates="design",
        cascade="all, delete-orphan",
        order_by="DesignHotspot.created_at",
    )


class DesignHotspot(Base):
    """A clickable region on a design image, optionally tied to a material.

    Coordinates are fractions (0-1) of the image's width/height so they stay
    correct at any display size. w = h = 0 means a point pin.
    """

    __tablename__ = "design_hotspots"

    id: Mapped[object] = uuid_pk()
    design_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("designs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    material_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("materials_rates.id", ondelete="SET NULL"),
        nullable=True,
    )
    # The quotation line created from this hotspot; cleared if that line is
    # deleted so the hotspot can be added again.
    quotation_line_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("quotation_line_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(2000))
    # Free text, e.g. "8ft x 7ft".
    dimensions: Mapped[str | None] = mapped_column(String(100))
    labour_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    w: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    h: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

    design: Mapped["Design"] = relationship(
        "Design", back_populates="hotspots"
    )
    material: Mapped["MaterialRate | None"] = relationship("MaterialRate")  # type: ignore[name-defined]
