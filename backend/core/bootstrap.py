"""Bootstrap initial admin user on first startup."""

from passlib.context import CryptContext

from ..models.user import User, UserRole
from .config import settings
from .database import SessionLocal

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def bootstrap_admin() -> None:
    """Create the initial admin user from env vars if no admin exists yet."""
    if not settings.initial_admin_email or not settings.initial_admin_password:
        return

    db = SessionLocal()
    try:
        existing = (
            db.query(User)
            .filter(User.email == settings.initial_admin_email)
            .first()
        )
        if existing:
            # The configured initial user owns the platform.
            if existing.role != UserRole.superadmin:
                existing.role = UserRole.superadmin
                db.commit()
            return

        admin = User(
            email=settings.initial_admin_email,
            full_name="Super Admin",
            password_hash=_pwd_ctx.hash(settings.initial_admin_password),
            role=UserRole.superadmin,
            is_active=True,
        )
        db.add(admin)
        db.commit()
    finally:
        db.close()
