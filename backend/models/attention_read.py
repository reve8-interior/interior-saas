import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class AttentionRead(Base):
    """One 'needs attention' item a user has marked read.

    The key names the item and its state (e.g. a customer reply by share and
    time), so a newer reply on the same link is unread again.
    """

    __tablename__ = "attention_reads"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    item_key: Mapped[str] = mapped_column(String(200), primary_key=True)
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
