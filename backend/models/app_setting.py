from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class AppSetting(Base, TimestampMixin):
    """Generic key/value store for portal-wide configuration.

    Known keys:
    - "line_item_columns": {"columns": [...]} — quotation line-item
      column definitions (see services.column_settings).
    """

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
