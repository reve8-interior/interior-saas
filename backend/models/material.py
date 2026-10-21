from datetime import datetime

import uuid

from sqlalchemy import DateTime, ForeignKey, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..rls import BUSINESS_ID_DEFAULT
from .base import Base, uuid_pk


class MaterialRate(Base):
    __tablename__ = "materials_rates"

    id: Mapped[object] = uuid_pk()
    # Filled from the request's business by a DB default; see backend/rls.py.
    business_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        server_default=text(BUSINESS_ID_DEFAULT),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True
    )
    unit: Mapped[str] = mapped_column(
        String(50), nullable=False, default="sqft"
    )
    unit_cost: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    vendor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
