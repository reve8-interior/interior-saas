"""Business admins manage their own team: add, edit roles, disable, remove."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..core import get_db
from ..models.user import User
from ..schemas.client import MemberClientsRead, MemberClientsUpdate
from ..schemas.business_user import (
    AuditPage,
    BusinessUserCreate,
    BusinessUserRead,
    BusinessUserUpdate,
    ResetPasswordRequest,
    ResetPasswordResponse,
    TeamOverview,
)
from ..services import audit, client_access, team
from .deps import require_business_admin

router = APIRouter()


def _not_self(actor: User, user: User, what: str) -> None:
    if actor.id == user.id:
        raise HTTPException(
            status_code=400, detail=f"You cannot {what} your own account."
        )


@router.get("", response_model=TeamOverview)
def get_team(
    db: Session = Depends(get_db),
    actor: User = Depends(require_business_admin),
):
    return team.overview(team.business_or_404(actor.business_id, db), db)


@router.post("", response_model=BusinessUserRead, status_code=201)
def add_member(
    body: BusinessUserCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_business_admin),
):
    return team.create_member(actor.business_id, body, db, actor)


@router.patch("/{user_id}", response_model=BusinessUserRead)
def update_member(
    user_id: uuid.UUID,
    body: BusinessUserUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_business_admin),
):
    user = team.member_or_404(actor.business_id, user_id, db)
    changes = body.model_dump(exclude_unset=True)
    if "role" in changes and changes["role"] != user.role:
        _not_self(actor, user, "change the role of")
    if changes.get("is_active") is False:
        _not_self(actor, user, "disable")
    return team.update_member(actor.business_id, user, body, db, actor)


@router.post("/{user_id}/reset-password", response_model=ResetPasswordResponse)
def reset_member_password(
    user_id: uuid.UUID,
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_business_admin),
):
    user = team.member_or_404(actor.business_id, user_id, db)
    _not_self(actor, user, "reset the password of")
    temporary = team.reset_password(
        actor.business_id, user, body.password, db, actor
    )
    return ResetPasswordResponse(temporary_password=temporary)


@router.delete("/{user_id}", status_code=204)
def remove_member(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(require_business_admin),
):
    user = team.member_or_404(actor.business_id, user_id, db)
    _not_self(actor, user, "remove")
    team.remove_member(actor.business_id, user, db, actor)


@router.get("/audit", response_model=AuditPage)
def team_audit(
    limit: int = Query(50, ge=1, le=audit.MAX_PAGE),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None, max_length=100),
    actor_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(require_business_admin),
):
    return audit.list_entries(
        db,
        actor.business_id,
        limit=limit,
        offset=offset,
        action=action,
        actor_id=actor_id,
    )


@router.get("/{user_id}/clients", response_model=MemberClientsRead)
def get_member_clients(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(require_business_admin),
):
    user = team.member_or_404(actor.business_id, user_id, db)
    return client_access.member_clients(user, db)


@router.put("/{user_id}/clients", response_model=MemberClientsRead)
def set_member_clients(
    user_id: uuid.UUID,
    body: MemberClientsUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_business_admin),
):
    """Choose which clients (besides ones they lead) a designer can see."""
    user = team.member_or_404(actor.business_id, user_id, db)
    return client_access.set_member_clients(
        user, set(body.client_ids), actor.business_id, db, actor
    )
