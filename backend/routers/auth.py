from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.logging import logger
from ..core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from ..models.user import User, UserRole
from ..schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    ProfileUpdate,
    TokenResponse,
    UserMe,
)
from ..services import audit
from ..services.subscription import access_status
from .deps import get_current_user, get_user_allow_expired

router = APIRouter()


def _authenticate(
    request: LoginRequest, db: Session, *, superadmin: bool
) -> TokenResponse:
    """Verify credentials; superadmins only sign in via the admin endpoint."""
    user = (
        db.execute(
            select(User).where(func.lower(User.email) == request.email.lower())
        )
        .scalars()
        .first()
    )
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    if (user.role == UserRole.superadmin) != superadmin:
        # Same message as bad credentials: don't reveal which accounts exist.
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.business and not user.business.is_active:
        raise HTTPException(status_code=403, detail="Business is deactivated")

    user.last_login_at = datetime.now(timezone.utc)
    if user.business_id:
        audit.record(
            db,
            actor=user,
            business_id=user.business_id,
            action="auth.login",
            entity_type="user",
            entity_id=user.id,
        )
    db.commit()

    token = create_access_token(
        user_id=str(user.id), email=user.email, role=user.role
    )
    logger.info("user_login", user_id=str(user.id), role=user.role)
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        email=user.email,
        role=user.role,
    )


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Portal login for businesses added by the superadmin."""
    return _authenticate(request, db, superadmin=False)


@router.post("/admin/login", response_model=TokenResponse)
def admin_login(request: LoginRequest, db: Session = Depends(get_db)):
    """Superadmin-only login for the /admin console."""
    return _authenticate(request, db, superadmin=True)


@router.get("/me", response_model=UserMe)
def me(current_user: User = Depends(get_user_allow_expired)):
    # Expired users must still load /me so the UI can show the renewal page.
    return _me(current_user)


def _me(user: User) -> UserMe:
    return UserMe(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        must_change_password=user.must_change_password,
        business_name=user.business.name if user.business else None,
        access=access_status(user.business),
    )


@router.patch("/me", response_model=UserMe)
def update_profile(
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.full_name = body.full_name.strip()
    db.commit()
    db.refresh(current_user)
    return _me(current_user)


@router.post("/change-password", status_code=204)
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_allow_expired),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=400, detail="Current password is incorrect"
        )
    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=400,
            detail="New password must differ from the current password",
        )
    current_user.password_hash = get_password_hash(body.new_password)
    current_user.must_change_password = False
    if current_user.business_id:
        audit.record(
            db,
            actor=current_user,
            business_id=current_user.business_id,
            action="auth.password_changed",
            entity_type="user",
            entity_id=current_user.id,
        )
    db.commit()
    logger.info("password_changed", user_id=str(current_user.id))
