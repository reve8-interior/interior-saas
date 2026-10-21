import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..core import get_db
from ..models.business import Business
from ..models.user import User
from ..schemas.admin_monitor import (
    AdminOverview,
    BusinessAIUsage,
    BusinessClientRow,
)
from ..services import admin_monitor_service
from .deps import require_superadmin

router = APIRouter()


@router.get("/overview", response_model=AdminOverview)
def overview(
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    return admin_monitor_service.get_overview(db)


@router.get(
    "/businesses/{business_id}/clients",
    response_model=list[BusinessClientRow],
)
def business_clients(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    if not db.get(Business, business_id):
        raise HTTPException(status_code=404, detail="Business not found")
    return admin_monitor_service.get_business_clients(db, business_id)


@router.get("/unassigned/clients", response_model=list[BusinessClientRow])
def unassigned_clients(
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    return admin_monitor_service.get_business_clients(db, None)


@router.get("/businesses/{business_id}/usage", response_model=BusinessAIUsage)
def business_ai_usage(
    business_id: uuid.UUID,
    days: int = Query(30, ge=1, le=90),
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    if not db.get(Business, business_id):
        raise HTTPException(status_code=404, detail="Business not found")
    return admin_monitor_service.get_business_ai_usage(db, business_id, days)
