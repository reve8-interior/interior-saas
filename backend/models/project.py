import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..rls import BUSINESS_ID_DEFAULT
from .base import Base, uuid_pk


class Project(Base):
    """A named case study on the designer's public website; groups designs."""

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = uuid_pk()
    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        server_default=text(BUSINESS_ID_DEFAULT),
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255))
    year: Mapped[int | None] = mapped_column(Integer)
    category: Mapped[str | None] = mapped_column(String(100))
    story: Mapped[str | None] = mapped_column(Text)
    # use_alter: designs.project_id points back here, so this FK is added after
    # both tables exist. SET NULL keeps the project if the cover is deleted.
    cover_design_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "designs.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_projects_cover_design_id",
        ),
        nullable=True,
    )
    # Order on the website (lowest first).
    position: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
