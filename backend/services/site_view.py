"""Public website payload for a business: full site or simple gallery.

Runs unscoped for public requests, so every query filters business_id
explicitly. Output is built field by field into whitelisted schemas.
"""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..models.business import Business
from ..models.client import Client
from ..models.design import Design
from ..models.project import Project
from ..schemas.site import (
    FullSiteView,
    GalleryView,
    PublicDesign,
    PublicProject,
    PublicProjectDesign,
    SiteContact,
    SiteService,
    SiteSocial,
    SiteView,
)
from .plan_limits import get_plan, locked_portfolio_ids
from .portfolio import design_thumb_url, design_view_url, portfolio_designs_q
from .site_access import site_mode
from .storage import signed_media_url


def _media(path: str | None) -> str | None:
    return signed_media_url(path) if path else None


def _gallery(db: Session, business: Business) -> GalleryView:
    q = portfolio_designs_q(business.id, with_hotspots=False).where(
        Design.id.notin_(locked_portfolio_ids(business, db))
    )
    designs = db.execute(q).scalars().all()
    return GalleryView(
        business_name=business.name,
        designs=[
            PublicDesign(
                id=d.id,
                title=d.title,
                description=d.description,
                image_url=design_view_url(d),
                thumb_url=design_thumb_url(d),
            )
            for d in designs
        ],
    )


def _project_designs(
    db: Session, business: Business, project_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[Design]]:
    """Designs per project, in project order; skips inactive clients' work."""
    if not project_ids:
        return {}
    rows = (
        db.execute(
            select(Design)
            .outerjoin(Client, Client.id == Design.client_id)
            .where(Design.business_id == business.id)
            .where(Design.project_id.in_(project_ids))
            .where(or_(Design.client_id.is_(None), Client.is_active.is_(True)))
            .order_by(
                Design.project_position.asc().nulls_last(),
                Design.created_at.asc(),
            )
        )
        .scalars()
        .all()
    )
    by_project: dict[uuid.UUID, list[Design]] = {
        pid: [] for pid in project_ids
    }
    for d in rows:
        by_project[d.project_id].append(d)
    return by_project


def _project(project: Project, designs: list[Design]) -> PublicProject:
    cover = next(
        (d for d in designs if d.id == project.cover_design_id),
        designs[0] if designs else None,
    )
    return PublicProject(
        id=project.id,
        title=project.title,
        location=project.location,
        year=project.year,
        category=project.category,
        story=project.story,
        cover_url=design_view_url(cover) if cover else None,
        designs=[
            PublicProjectDesign(
                id=d.id,
                title=d.title,
                description=d.description,
                image_url=design_view_url(d),
                thumb_url=design_thumb_url(d),
                rooms=list(d.rooms or []),
            )
            for d in designs
        ],
    )


def _full_site(db: Session, business: Business) -> FullSiteView:
    projects = (
        db.execute(
            select(Project)
            .where(Project.business_id == business.id)
            .order_by(Project.position.asc(), Project.created_at.asc())
        )
        .scalars()
        .all()
    )
    designs = _project_designs(db, business, [p.id for p in projects])
    can_hide = get_plan(db, business.plan).website_remove_badge
    return FullSiteView(
        business_name=business.name,
        slug=business.slug,
        logo_url=_media(business.logo_path),
        hero_url=_media(business.hero_path),
        tagline=business.site_tagline,
        about=business.site_about,
        services=[
            SiteService.model_validate(s) for s in business.site_services or []
        ],
        socials=[
            SiteSocial.model_validate(s) for s in business.site_socials or []
        ],
        contact=SiteContact(
            email=business.contact_email,
            phone=business.contact_phone,
            address=business.site_address,
        ),
        show_badge=not (business.hide_badge and can_hide),
        theme=business.site_theme,
        projects=[_project(p, designs[p.id]) for p in projects],
    )


def build_site_view(db: Session, business: Business) -> SiteView:
    """Gallery or full site per the plan; publish state is the caller's job."""
    if site_mode(db, business) == "site":
        return _full_site(db, business)
    return _gallery(db, business)
