import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, uuid_pk


class ConfirmationMethod(str, enum.Enum):
    client_reply = "client_reply"
    designer_override = "designer_override"


class FinalSummary(Base):
    __tablename__ = "final_summaries"

    id: Mapped[object] = uuid_pk()
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    checkpoint_id_ref: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("checkpoints.id", ondelete="SET NULL"),
        nullable=True,
    )
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    confirmed_by: Mapped[str | None] = mapped_column(
        Enum(ConfirmationMethod, name="confirmation_method"), nullable=True
    )
    confirmed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

    client: Mapped["Client"] = relationship(
        "Client", back_populates="final_summary"
    )  # type: ignore[name-defined]
    checkpoint: Mapped["Checkpoint | None"] = relationship("Checkpoint")  # type: ignore[name-defined]
    confirmed_by_user: Mapped["User | None"] = relationship("User")  # type: ignore[name-defined]
