import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..rls import BUSINESS_ID_DEFAULT
from .base import Base, uuid_pk


class AgentAuditLog(Base):
    __tablename__ = "agent_audit_log"

    id: Mapped[object] = uuid_pk()
    # Null for calls that aren't about a client (e.g. materials extraction).
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Filled from the request's business by a DB default; see rls.py.
    business_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        server_default=text(BUSINESS_ID_DEFAULT),
    )
    operation: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    # USD at list price when the call was made; null if the model is unpriced.
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="success"
    )
    # SHA-256 of raw input — never store PII in audit rows
    raw_input_hash: Mapped[str | None] = mapped_column(String(64))
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, index=True
    )
