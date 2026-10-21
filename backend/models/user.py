import enum

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, uuid_pk


class UserRole(str, enum.Enum):
    superadmin = "superadmin"
    admin = "admin"
    designer = "designer"
    # Read-only: may view everything in the business, change nothing.
    viewer = "viewer"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[object] = uuid_pk()
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    full_name: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        Enum(UserRole, name="user_role"),
        nullable=False,
        default=UserRole.designer,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Set when an admin issues a temporary password; cleared on change.
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    business_id: Mapped[object | None] = mapped_column(
        ForeignKey("businesses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    business: Mapped["Business | None"] = relationship(  # type: ignore[name-defined]
        "Business", back_populates="users"
    )

    assigned_clients: Mapped[list["Client"]] = relationship(  # type: ignore[name-defined]
        "Client",
        back_populates="assigned_designer",
        foreign_keys="Client.assigned_designer_id",
    )
