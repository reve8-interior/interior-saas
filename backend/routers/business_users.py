"""Superadmin management of a business's login users and audit trail."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..core import get_db
from ..models.user import User
from ..schemas.business_user import (
    AuditPage,
    BusinessUserCreate,
    BusinessUserRead,
    BusinessUserUpdate,
    ResetPasswordRequest,
    ResetPasswordResponse,
    TeamOverview,
)
from ..services import audit, team
from .deps import require_superadmin

router = APIRouter()


@router.get("/{business_id}/users", response_model=list[BusinessUserRead])
def list_users(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    return team.overview(team.business_or_404(business_id, db), db).members


@router.get("/{business_id}/team", response_model=TeamOverview)
def team_overview(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    return team.overview(team.business_or_404(business_id, db), db)


@router.post(
    "/{business_id}/users", response_model=BusinessUserRead, status_code=201
)
def create_user(
    business_id: uuid.UUID,
    body: BusinessUserCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    team.business_or_404(business_id, db)
    return team.create_member(business_id, body, db, actor)


@router.patch(
    "/{business_id}/users/{user_id}", response_model=BusinessUserRead
)
def update_user(
    business_id: uuid.UUID,
    user_id: uuid.UUID,
    body: BusinessUserUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    user = team.member_or_404(business_id, user_id, db)
    return team.update_member(business_id, user, body, db, actor)


@router.post(
    "/{business_id}/users/{user_id}/reset-password",
    response_model=ResetPasswordResponse,
)
def reset_password(
    business_id: uuid.UUID,
    user_id: uuid.UUID,
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    user = team.member_or_404(business_id, user_id, db)
    temporary = team.reset_password(
        business_id, user, body.password, db, actor
    )
    return ResetPasswordResponse(temporary_password=temporary)


@router.delete("/{business_id}/users/{user_id}", status_code=204)
def remove_user(
    business_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    user = team.member_or_404(business_id, user_id, db)
    team.remove_member(business_id, user, db, actor)


@router.get("/{business_id}/audit", response_model=AuditPage)
def business_audit(
    business_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=audit.MAX_PAGE),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None, max_length=100),
    actor_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    team.business_or_404(business_id, db)
    return audit.list_entries(
        db,
        business_id,
        limit=limit,
        offset=offset,
        action=action,
        actor_id=actor_id,
    )
