"""Plan lookup, per-business effective limits, and create-time enforcement.

A business's limit is its own override when the platform admin set one,
otherwise its plan's value. Null means unlimited at either level.
"""

import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.business import Business
from ..models.client import Client
from ..models.design import Design
from ..models.plan import Plan
from ..models.quotation_version import QuotationVersion
from ..schemas.plan import PlanFields, PlanLimits, UsageMeter
from .plan_catalog import (
    DEFAULT_PLANS,
    DEFAULTS_BY_SLUG,
    FREE_SLUG,
    PLAN_ALIASES,
)

_FIELDS = tuple(PlanFields.model_fields)


def canonical_slug(slug: str) -> str:
    """Map retired slugs (e.g. "pro") onto the plan that replaced them."""
    return PLAN_ALIASES.get(slug, slug)


def seed_plans(db: Session) -> int:
    """Insert built-in plans that don't exist yet; never touches edited ones."""
    existing = set(db.scalars(select(Plan.slug)))
    added = 0
    for default in DEFAULT_PLANS:
        if default.slug in existing:
            continue
        db.add(Plan(**default.model_dump()))
        added += 1
    if added:
        db.commit()
    return added


def ensure_plan_exists(db: Session, slug: str) -> None:
    """Raise 422 unless the slug names a stored or built-in plan."""
    slug = canonical_slug(slug)
    if slug in DEFAULTS_BY_SLUG:
        return
    if db.scalar(select(Plan.id).where(Plan.slug == slug)) is None:
        raise HTTPException(status_code=422, detail=f"Unknown plan: {slug}")


def get_plan(db: Session, slug: str) -> PlanFields:
    """The plan's editable fields: its row, else the built-in default."""
    slug = canonical_slug(slug)
    row = db.scalar(select(Plan).where(Plan.slug == slug))
    if row is not None:
        return PlanFields.model_validate(row, from_attributes=True)
    default = DEFAULTS_BY_SLUG.get(slug) or DEFAULTS_BY_SLUG[FREE_SLUG]
    return PlanFields.model_validate(default.model_dump())


def effective_limits(db: Session, business: Business) -> PlanLimits:
    """The plan's values with the business's overrides applied."""
    plan = get_plan(db, business.plan)
    values = {
        name: getattr(plan, name)
        for name in PlanLimits.model_fields
        if name in _FIELDS
    }
    for name in (
        "max_users",
        "max_clients",
        "max_quotation_versions",
        "max_images",
        "max_image_mb",
        "max_portfolio_designs",
    ):
        override = getattr(business, name)
        if override is not None:
            values[name] = override
    if plan.ai_credits_monthly is not None:
        values["ai_credits_monthly"] = (
            plan.ai_credits_monthly + business.ai_credit_bonus
        )
    return PlanLimits(
        plan=canonical_slug(business.plan), plan_name=plan.name, **values
    )


def _blocked(limit: int, what: str) -> HTTPException:
    return HTTPException(
        status_code=403,
        detail=(
            f"Your plan allows {limit} {what}. Upgrade your plan to add more."
        ),
    )


def active_client_count(business_id: uuid.UUID, db: Session) -> int:
    return (
        db.scalar(
            select(func.count(Client.id)).where(
                Client.business_id == business_id, Client.is_active.is_(True)
            )
        )
        or 0
    )


def portfolio_design_count(business_id: uuid.UUID, db: Session) -> int:
    return (
        db.scalar(
            select(func.count(Design.id)).where(
                Design.business_id == business_id,
                Design.in_portfolio.is_(True),
            )
        )
        or 0
    )


def version_count(quotation_id: uuid.UUID, db: Session) -> int:
    return (
        db.scalar(
            select(func.count(QuotationVersion.id)).where(
                QuotationVersion.quotation_id == quotation_id
            )
        )
        or 0
    )


def ensure_can_add_client(business: Business | None, db: Session) -> None:
    if business is None:
        return
    limit = effective_limits(db, business).max_clients
    if limit is not None and active_client_count(business.id, db) >= limit:
        raise _blocked(limit, "active clients")


def ensure_can_add_version(
    business: Business | None, quotation_id: uuid.UUID, db: Session
) -> None:
    if business is None:
        return
    limit = effective_limits(db, business).max_quotation_versions
    if limit is not None and version_count(quotation_id, db) >= limit:
        raise _blocked(limit, "versions per quotation")


def ensure_can_add_to_portfolio(
    business: Business | None, db: Session
) -> None:
    if business is None:
        return
    limit = effective_limits(db, business).max_portfolio_designs
    if limit is not None and portfolio_design_count(business.id, db) >= limit:
        raise _blocked(limit, "portfolio designs")


def usage_summary(db: Session, business: Business) -> list[UsageMeter]:
    """Every metered limit with current usage, for the tenant UI."""
    from .image_quota import uploaded_image_count
    from .team import seats_used

    limits = effective_limits(db, business)
    return [
        UsageMeter(
            key="clients",
            label="Active clients",
            used=active_client_count(business.id, db),
            limit=limits.max_clients,
        ),
        UsageMeter(
            key="users",
            label="Team members",
            used=seats_used(business.id, db),
            limit=limits.max_users,
        ),
        UsageMeter(
            key="images",
            label="Uploaded images",
            used=uploaded_image_count(business.id, db),
            limit=limits.max_images,
        ),
        UsageMeter(
            key="portfolio",
            label="Portfolio designs",
            used=portfolio_design_count(business.id, db),
            limit=limits.max_portfolio_designs,
        ),
    ]
