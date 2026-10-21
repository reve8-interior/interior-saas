import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, uuid_pk


class ShareLink(Base):
    """Public, view-only link to a client's design images."""

    __tablename__ = "share_links"

    id: Mapped[object] = uuid_pk()
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Unguessable bearer secret embedded in the public URL.
    token: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    # Design ids included in the link; null shares every design of the client.
    design_ids: Mapped[list[str] | None] = mapped_column(JSONB)
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
