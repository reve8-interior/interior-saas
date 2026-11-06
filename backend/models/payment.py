from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Sequence, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, uuid_pk

# Receipt numbers count up across all businesses and never repeat.
receipt_seq = Sequence("payment_receipt_seq", metadata=Base.metadata)


class Payment(Base):
    """One captured payment; the source of the receipt a business can print."""

    __tablename__ = "payments"

    id: Mapped[object] = uuid_pk()
    business_id: Mapped[object] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The unique payment id makes a redelivered webhook harmless.
    razorpay_payment_id: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False
    )
    razorpay_order_id: Mapped[str | None] = mapped_column(String(64))
    razorpay_subscription_id: Mapped[str | None] = mapped_column(String(64))
    receipt_number: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False
    )
    plan_slug: Mapped[str] = mapped_column(String(32), nullable=False)
    plan_name: Mapped[str] = mapped_column(String(100), nullable=False)
    billing_cycle: Mapped[str] = mapped_column(String(10), nullable=False)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    # upi / card / netbanking ... as reported by Razorpay; never card numbers.
    method: Mapped[str | None] = mapped_column(String(32))
    paid_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
