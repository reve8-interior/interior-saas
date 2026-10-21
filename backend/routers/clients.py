import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.logging import logger
from ..models.audit import AuditLog
from ..models.client import Client, ProjectPhase
from ..models.user import User, UserRole
from ..schemas.client import (
    ClientAccessRead,
    ClientAccessUpdate,
    ClientCreate,
    ClientRead,
    ClientUpdate,
    PhaseUpdate,
)
from ..services import client_access as access
from ..services.client_access import get_client_or_404, restrict_to_accessible
from .deps import get_current_user, require_business_admin

router = APIRouter()


def _ensure_assignable(
    user_id: uuid.UUID | None, db: Session, business_id: uuid.UUID | None
) -> None:
    """The lead must be an active member of the caller's business."""
    if user_id is None:
        return
    lead = db.get(User, user_id)
    if (
        not lead
        or lead.business_id != business_id
        or not lead.is_active
        or lead.role == UserRole.viewer
    ):
        raise HTTPException(status_code=422, detail="Invalid assignee")


@router.get("", response_model=list[ClientRead])
def list_clients(
    show_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Client).where(Client.is_active == (not show_inactive))
    q = restrict_to_accessible(q, current_user)
    return db.execute(q.order_by(Client.created_at.desc())).scalars().all()


@router.post("", response_model=ClientRead, status_code=201)
def create_client(
    body: ClientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Designers only see clients they lead, so theirs always start with them.
    if current_user.role == UserRole.designer:
        lead_id = current_user.id
    else:
        lead_id = body.assigned_designer_id
        _ensure_assignable(lead_id, db, current_user.business_id)
    client = Client(
        name=body.name,
        contact_info=body.contact_info,
        notes=body.notes,
        assigned_designer_id=lead_id,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    logger.info(
        "client_created", client_id=str(client.id), by=str(current_user.id)
    )
    return client


@router.get("/{client_id}", response_model=ClientRead)
def get_client(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_client_or_404(client_id, db, current_user)


@router.put("/{client_id}", response_model=ClientRead)
def update_client(
    client_id: str,
    body: ClientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = get_client_or_404(client_id, db, current_user)
    for field, value in body.model_dump(exclude_none=True).items():
        if field == "assigned_designer_id":
            if current_user.role == UserRole.designer:
                raise HTTPException(
                    status_code=403,
                    detail="Only an admin can reassign a client",
                )
            _ensure_assignable(value, db, current_user.business_id)
        elif field == "contact_info":
            value = {**(client.contact_info or {}), **value}
        setattr(client, field, value)
    db.commit()
    db.refresh(client)
    return client


@router.get("/{client_id}/access", response_model=ClientAccessRead)
def get_client_access(
    client_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_business_admin),
):
    return access.client_access(get_client_or_404(client_id, db, admin), db)


@router.put("/{client_id}/access", response_model=ClientAccessRead)
def set_client_access(
    client_id: str,
    body: ClientAccessUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_business_admin),
):
    """Choose which designers (besides the lead) can see this client."""
    client = get_client_or_404(client_id, db, admin)
    return access.set_client_members(
        client, set(body.member_ids), admin.business_id, db, admin
    )


@router.put("/{client_id}/phase", response_model=ClientRead)
def update_phase(
    client_id: str,
    body: PhaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = get_client_or_404(client_id, db, current_user)
    if body.phase not in [p.value for p in ProjectPhase]:
        raise HTTPException(
            status_code=400, detail=f"Invalid phase: {body.phase}"
        )
    old_phase = client.current_phase
    client.current_phase = body.phase

    # Track when the project was completed
    if body.phase == ProjectPhase.completed:
        client.completed_at = datetime.utcnow()
    elif old_phase == ProjectPhase.completed:
        client.completed_at = None

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="phase_changed",
            entity_type="client",
            entity_id=str(client.id),
            payload={"from": old_phase, "to": body.phase},
            timestamp=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(client)
    logger.info(
        "phase_updated",
        client_id=client_id,
        phase=body.phase,
        by=str(current_user.id),
    )
    return client


@router.patch("/{client_id}/deactivate", response_model=ClientRead)
def deactivate_client(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = get_client_or_404(client_id, db, current_user)
    if not client.is_active:
        raise HTTPException(
            status_code=400, detail="Client is already inactive"
        )
    client.is_active = False
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="client_deactivated",
            entity_type="client",
            entity_id=str(client.id),
            payload={},
            timestamp=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(client)
    logger.info(
        "client_deactivated", client_id=client_id, by=str(current_user.id)
    )
    return client


@router.patch("/{client_id}/activate", response_model=ClientRead)
def activate_client(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = get_client_or_404(client_id, db, current_user)
    if client.is_active:
        raise HTTPException(status_code=400, detail="Client is already active")
    client.is_active = True
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="client_activated",
            entity_type="client",
            entity_id=str(client.id),
            payload={},
            timestamp=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(client)
    logger.info(
        "client_activated", client_id=client_id, by=str(current_user.id)
    )
    return client
