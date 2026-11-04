import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, uuid_pk


class CheckpointStatus(str, enum.Enum):
    draft = "draft"
    under_review = "under_review"
    agreed = "agreed"


class CheckpointSource(str, enum.Enum):
    chat = "chat"
    manual = "manual"
    ai_extract = "ai_extract"


class Checkpoint(Base, TimestampMixin):
    __tablename__ = "checkpoints"

    id: Mapped[uuid.UUID] = uuid_pk()
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    structured_diff: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(
        Enum(CheckpointStatus, name="checkpoint_status"),
        nullable=False,
        default=CheckpointStatus.draft,
    )
    source: Mapped[str] = mapped_column(
        Enum(CheckpointSource, name="checkpoint_source"),
        nullable=False,
        default=CheckpointSource.manual,
    )
    raw_conversation: Mapped[str | None] = mapped_column(Text)
    audio_transcript: Mapped[str | None] = mapped_column(Text)
    added_to_quotation: Mapped[bool] = mapped_column(
        default=False, nullable=False, server_default="false"
    )

    # When the rows reached the quotation, and who added them. Undo
    # order follows this, not the order the notes were written.
    applied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    applied_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    client: Mapped["Client"] = relationship(
        "Client", back_populates="checkpoints"
    )  # type: ignore[name-defined]
    applied_by: Mapped["User | None"] = relationship("User")  # type: ignore[name-defined]

    @property
    def applied_by_name(self) -> str | None:
        user = self.applied_by
        return (user.full_name or user.email) if user else None
