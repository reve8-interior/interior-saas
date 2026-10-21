import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, uuid_pk


class QuotationVersion(Base):
    """Immutable, numbered copy of a quotation's line items.

    The live quotation stays the editable working copy; a version is what
    gets compared, opened later and shared.
    """

    __tablename__ = "quotation_versions"
    __table_args__ = (
        UniqueConstraint("quotation_id", "number"),
        Index(
            "uq_quotation_versions_agreed",
            "quotation_id",
            unique=True,
            postgresql_where=text("is_agreed"),
        ),
    )

    id: Mapped[object] = uuid_pk()
    quotation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("quotations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str | None] = mapped_column(String(120))
    # QuotationLineItemRead dumps, frozen at save time.
    line_items: Mapped[list] = mapped_column(JSONB, nullable=False)
    initial_total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    negotiated_total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    # {room name: [design ids]} shown with that room when the version is shared.
    room_designs: Mapped[dict[str, list[str]]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    # Conversation (checkpoint) that produced this state, if any.
    checkpoint_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("checkpoints.id", ondelete="SET NULL"),
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    # Inactive versions stay listed but cannot be shared or opened by link.
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    # The version designer and client settled on; at most one per quotation
    # (enforced by a partial unique index).
    is_agreed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    agreed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    agreed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )


class QuotationShare(Base):
    """Public, expiring, view-only link to one quotation version."""

    __tablename__ = "quotation_shares"

    id: Mapped[object] = uuid_pk()
    version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("quotation_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Unguessable bearer secret embedded in the public URL.
    token: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    show_prices: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
