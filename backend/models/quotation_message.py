import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, uuid_pk


class QuotationMessage(Base):
    """One thing a customer sent from a shared quotation link.

    Every answer is kept, so a later message never hides an earlier one. A
    question stays open (and keeps the bell lit) until a designer resolves it.
    """

    __tablename__ = "quotation_messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    quotation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("quotations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("quotation_versions.id", ondelete="SET NULL"),
        index=True,
    )
    # Kept apart from version_id so the number survives a deleted version.
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # "approved" or "question".
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    message: Mapped[str | None] = mapped_column(String(2000))
    # "Room · line" when the question is about one line of the quotation.
    item_label: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
