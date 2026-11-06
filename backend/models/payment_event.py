from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, uuid_pk


class PaymentEvent(Base):
    """A processed Razorpay webhook; its unique id makes replays harmless."""

    __tablename__ = "payment_events"

    id: Mapped[object] = uuid_pk()
    razorpay_event_id: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    business_id: Mapped[object | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Subscription / order / payment ids and amounts only; no card data.
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
