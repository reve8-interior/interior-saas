import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, uuid_pk


class Feedback(Base):
    """One user's rating of one feature, with an optional multiple-choice pick.

    A user answers each feature once; answering again replaces the old row.
    """

    __tablename__ = "feedback"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "feature", name="uq_feedback_user_feature"
        ),
    )

    id: Mapped[object] = uuid_pk()
    # Kept when the user or business is deleted, so the ratings survive.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    business_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="SET NULL"),
        index=True,
    )
    # A key of the catalog in services/feedback_catalog.py.
    feature: Mapped[str] = mapped_column(String(32), nullable=False)
    # 1 to 5 stars.
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    # The picked option's value for that feature, if any.
    choice: Mapped[str | None] = mapped_column(String(48))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
