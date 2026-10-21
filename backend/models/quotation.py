import enum
import uuid

from sqlalchemy import Enum, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, uuid_pk


class QuotationStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"


class Quotation(Base, TimestampMixin):
    """
    A client's quotation. All amounts live on the line items
    (quotation_line_items); totals and the negotiation state are
    derived on read, never stored.
    """

    __tablename__ = "quotations"

    id: Mapped[object] = uuid_pk()
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    design_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("designs.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        Enum(QuotationStatus, name="quotation_status"),
        nullable=False,
        default=QuotationStatus.pending,
    )
    # FK to the checkpoint that last produced this quotation's line items
    checkpoint_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("checkpoints.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Ordered list of snapshots: [{checkpoint_id, created_at, line_items: [...]}]
    snapshots: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )

    client: Mapped["Client"] = relationship(
        "Client", back_populates="quotations"
    )  # type: ignore[name-defined]
    design: Mapped["Design | None"] = relationship("Design")  # type: ignore[name-defined]
    line_items: Mapped[list["QuotationLineItem"]] = relationship(  # type: ignore[name-defined]
        "QuotationLineItem",
        back_populates="quotation",
        cascade="all, delete-orphan",
        order_by="QuotationLineItem.position",
    )
