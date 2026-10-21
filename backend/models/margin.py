from sqlalchemy import Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, uuid_pk


class MarginConfig(Base):
    __tablename__ = "margin_config"

    id: Mapped[object] = uuid_pk()
    # NULL category = global default margin
    category: Mapped[str | None] = mapped_column(
        String(100), nullable=True, unique=True
    )
    margin_percent: Mapped[float] = mapped_column(
        Numeric(5, 2), nullable=False
    )
