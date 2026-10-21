import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, String, DateTime, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from ..rls import BUSINESS_ID_DEFAULT
from .base import Base, TimestampMixin, uuid_pk


class ProjectPhase(str, enum.Enum):
    discussion = "discussion"
    design = "design"
    quotation = "quotation"
    implementation = "implementation"
    completed = "completed"


class Client(Base, TimestampMixin):
    __tablename__ = "clients"

    id: Mapped[object] = uuid_pk()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Filled from the request's business by a DB default; see backend/rls.py.
    business_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        server_default=text(BUSINESS_ID_DEFAULT),
    )
    contact_info: Mapped[dict] = mapped_column(JSONB, default=dict)
    assigned_designer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    current_phase: Mapped[str] = mapped_column(
        Enum(ProjectPhase, name="project_phase"),
        nullable=False,
        default=ProjectPhase.discussion,
    )
    notes: Mapped[str | None] = mapped_column(String(2000))
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    assigned_designer: Mapped["User"] = relationship(  # type: ignore[name-defined]
        "User",
        back_populates="assigned_clients",
        foreign_keys=[assigned_designer_id],
    )
    checkpoints: Mapped[list["Checkpoint"]] = relationship(  # type: ignore[name-defined]
        "Checkpoint", back_populates="client", order_by="Checkpoint.created_at"
    )
    designs: Mapped[list["Design"]] = relationship(  # type: ignore[name-defined]
        "Design", back_populates="client"
    )
    quotations: Mapped[list["Quotation"]] = relationship(  # type: ignore[name-defined]
        "Quotation", back_populates="client"
    )
    final_summary: Mapped["FinalSummary | None"] = relationship(  # type: ignore[name-defined]
        "FinalSummary", back_populates="client", uselist=False
    )
