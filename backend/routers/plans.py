"""Plans: a public catalogue for the landing page and admin editing."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.logging import logger
from ..models.business import Business
from ..models.plan import Plan
from ..models.user import User
from ..schemas.plan import (
    PlanCreate,
    PlanRead,
    PlanUpdate,
    PricingVisibility,
    PublicPlan,
)
from ..services import audit
from ..services.landing_settings import get_show_pricing, set_show_pricing
from ..services.plan_limits import seed_plans
from .deps import require_superadmin

public_router = APIRouter()
admin_router = APIRouter()


def _plan_or_404(plan_id: uuid.UUID, db: Session) -> Plan:
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@public_router.get("", response_model=list[PublicPlan])
def list_public_plans(db: Session = Depends(get_db)):
    """Plans shown on the landing page, cheapest first. No login needed.

    Empty when an admin has switched the pricing table off.
    """
    if not get_show_pricing(db):
        return []
    seed_plans(db)
    return db.scalars(
        select(Plan)
        .where(Plan.is_public.is_(True))
        .order_by(Plan.sort_order, Plan.price_monthly_inr)
    ).all()


@admin_router.get("/visibility", response_model=PricingVisibility)
def get_pricing_visibility(
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    return PricingVisibility(show_pricing=get_show_pricing(db))


@admin_router.put("/visibility", response_model=PricingVisibility)
def set_pricing_visibility(
    body: PricingVisibility,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    """Show or hide the landing-page pricing table."""
    set_show_pricing(db, body.show_pricing)
    audit.record(
        db,
        actor=actor,
        business_id=None,
        action="landing.pricing_visibility",
        entity_type="app_setting",
        entity_id=None,
        payload={"show_pricing": body.show_pricing},
    )
    db.commit()
    return body


@admin_router.get("", response_model=list[PlanRead])
def list_plans(
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    seed_plans(db)
    return db.scalars(select(Plan).order_by(Plan.sort_order, Plan.slug)).all()


@admin_router.post("", response_model=PlanRead, status_code=201)
def create_plan(
    body: PlanCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    plan = Plan(**body.model_dump())
    try:
        # A savepoint, so a duplicate slug doesn't undo the caller's work.
        with db.begin_nested():
            db.add(plan)
    except IntegrityError:
        raise HTTPException(
            status_code=409, detail="A plan with this slug already exists"
        ) from None
    if plan.is_recommended:
        _clear_other_recommended(plan, db)
    audit.record(
        db,
        actor=actor,
        business_id=None,
        action="plan.created",
        entity_type="plan",
        entity_id=plan.id,
        payload={"slug": plan.slug},
    )
    db.commit()
    db.refresh(plan)
    logger.info("plan_created", slug=plan.slug, by=str(actor.id))
    return plan


@admin_router.patch("/{plan_id}", response_model=PlanRead)
def update_plan(
    plan_id: uuid.UUID,
    body: PlanUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    plan = _plan_or_404(plan_id, db)
    changes = body.model_dump(exclude_unset=True)
    for non_null in (
        "name",
        "is_public",
        "is_recommended",
        "sort_order",
        "clean_export",
        "branded_export",
        "bulk_materials_import",
        "priority_support",
        "website_enabled",
        "website_templates",
        "website_max_pages",
        "website_custom_domain",
        "website_remove_badge",
        "highlights",
    ):
        if non_null in changes and changes[non_null] is None:
            raise HTTPException(
                status_code=422, detail=f"{non_null} cannot be null"
            )
    if "highlights" in changes:
        changes["highlights"] = PlanCreate(
            slug="tmp", name="tmp", highlights=changes["highlights"]
        ).highlights
    diff = {
        field: {"from": getattr(plan, field), "to": value}
        for field, value in changes.items()
        if getattr(plan, field) != value
    }
    for field, value in changes.items():
        setattr(plan, field, value)
    if changes.get("is_recommended"):
        _clear_other_recommended(plan, db)
    if diff:
        audit.record(
            db,
            actor=actor,
            business_id=None,
            action="plan.updated",
            entity_type="plan",
            entity_id=plan.id,
            payload={"slug": plan.slug, "changes": diff},
        )
    db.commit()
    db.refresh(plan)
    return plan


@admin_router.delete("/{plan_id}", status_code=204)
def delete_plan(
    plan_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    plan = _plan_or_404(plan_id, db)
    in_use = db.scalar(
        select(func.count(Business.id)).where(Business.plan == plan.slug)
    )
    if in_use:
        raise HTTPException(
            status_code=409,
            detail=f"{in_use} business(es) are on this plan. Move them first.",
        )
    audit.record(
        db,
        actor=actor,
        business_id=None,
        action="plan.deleted",
        entity_type="plan",
        entity_id=plan.id,
        payload={"slug": plan.slug},
    )
    db.delete(plan)
    db.commit()


def _clear_other_recommended(plan: Plan, db: Session) -> None:
    """Only one plan carries the "Recommended" badge."""
    for other in db.scalars(
        select(Plan).where(Plan.is_recommended.is_(True), Plan.id != plan.id)
    ):
        other.is_recommended = False
