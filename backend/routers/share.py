"""Share links: designer-managed (authenticated) and the public view."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..core import get_db
from ..models.business import Business
from ..models.client import Client
from ..models.design import Design, DesignHotspot
from ..models.portfolio_share import PortfolioShare
from ..models.share_link import ShareLink
from ..models.user import User
from ..schemas.share import (
    PortfolioShareCreate,
    PortfolioShareRead,
    PortfolioView,
    SharedDesign,
    SharedHotspot,
    SharedItem,
    SharedView,
    ShareLinkCreate,
    ShareLinkRead,
)
from ..services import share_links
from ..services.client_access import get_client_or_404, restrict_to_accessible
from .deps import get_current_user
from .designs import design_image_url

router = APIRouter()
public_router = APIRouter()


def _to_read(link: ShareLink) -> ShareLinkRead:
    return ShareLinkRead(
        id=link.id,
        client_id=link.client_id,
        url=share_links.public_url("share", link.token),
        design_ids=[uuid.UUID(d) for d in link.design_ids]
        if link.design_ids
        else None,
        show_prices=link.show_prices,
        expires_at=link.expires_at,
        revoked_at=link.revoked_at,
        created_at=link.created_at,
    )


@router.get(
    "/clients/{client_id}/share-links", response_model=list[ShareLinkRead]
)
def list_share_links(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)
    links = (
        db.execute(
            select(ShareLink)
            .where(ShareLink.client_id == uuid.UUID(client_id))
            .order_by(ShareLink.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [_to_read(link) for link in links]


@router.post(
    "/clients/{client_id}/share-links",
    response_model=ShareLinkRead,
    status_code=201,
)
def create_share_link(
    client_id: str,
    body: ShareLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)

    share_links.validate_future_expiry(body.expires_at)

    design_ids: list[str] | None = None
    if body.design_ids:
        wanted = set(body.design_ids)
        owned = set(
            db.execute(
                select(Design.id)
                .where(Design.client_id == uuid.UUID(client_id))
                .where(Design.id.in_(wanted))
            )
            .scalars()
            .all()
        )
        if owned != wanted:
            raise HTTPException(status_code=404, detail="Design not found")
        design_ids = sorted(str(d) for d in wanted)

    link = ShareLink(
        client_id=uuid.UUID(client_id),
        token=share_links.new_token(),
        design_ids=design_ids,
        show_prices=body.show_prices,
        expires_at=body.expires_at,
        created_by_id=current_user.id,
        created_at=share_links.now(),
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return _to_read(link)


@router.delete("/clients/{client_id}/share-links/{link_id}", status_code=204)
def revoke_share_link(
    client_id: str,
    link_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)
    link = (
        db.execute(
            select(ShareLink)
            .where(ShareLink.id == uuid.UUID(link_id))
            .where(ShareLink.client_id == uuid.UUID(client_id))
        )
        .scalars()
        .first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")
    if link.revoked_at is None:
        link.revoked_at = share_links.now()
        db.commit()
    return Response(status_code=204)


def _shared_hotspot(h: DesignHotspot, show_prices: bool) -> SharedHotspot:
    item = None
    if h.material:
        item = SharedItem(
            name=h.material.name,
            category=h.material.category,
            unit=h.material.unit,
            unit_cost=h.material.unit_cost if show_prices else None,
        )
    return SharedHotspot(
        id=h.id,
        label=h.label,
        notes=h.notes,
        dimensions=h.dimensions,
        labour_cost=h.labour_cost if show_prices else None,
        x=h.x,
        y=h.y,
        w=h.w,
        h=h.h,
        item=item,
    )


def _own_business(db: Session, user: User) -> Business:
    business = db.get(Business, user.business_id) if user.business_id else None
    if not business:
        raise HTTPException(status_code=400, detail="No business on account")
    return business


def _portfolio_designs_q(business_id: uuid.UUID):
    """Opted-in designs of one business's active clients, newest first."""
    return (
        select(Design)
        .join(Client, Client.id == Design.client_id)
        .options(
            selectinload(Design.hotspots).selectinload(DesignHotspot.material)
        )
        .where(Client.business_id == business_id)
        .where(Client.is_active.is_(True))
        .where(Design.in_portfolio.is_(True))
        .order_by(Design.created_at.desc())
    )


def _portfolio_view(
    db: Session, business: Business, design_ids: list[str] | None = None
) -> PortfolioView:
    q = _portfolio_designs_q(business.id)
    if design_ids is not None:
        q = q.where(Design.id.in_([uuid.UUID(d) for d in design_ids]))
    designs = db.execute(q).scalars().all()
    return PortfolioView(
        business_name=business.name,
        designs=[
            SharedDesign(
                id=d.id,
                title=d.title,
                description=d.description,
                image_url=design_image_url(d),
                hotspots=[_shared_hotspot(h, False) for h in d.hotspots],
            )
            for d in designs
        ],
    )


def _share_to_read(share: PortfolioShare) -> PortfolioShareRead:
    return PortfolioShareRead(
        id=share.id,
        url=share_links.public_url("portfolio", share.token),
        design_ids=[uuid.UUID(d) for d in share.design_ids],
        expires_at=share.expires_at,
        revoked_at=share.revoked_at,
        created_at=share.created_at,
    )


@router.get("/portfolio-shares", response_model=list[PortfolioShareRead])
def list_portfolio_shares(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    business = _own_business(db, current_user)
    shares = (
        db.execute(
            select(PortfolioShare)
            .where(PortfolioShare.business_id == business.id)
            .order_by(PortfolioShare.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [_share_to_read(s) for s in shares]


@router.post(
    "/portfolio-shares", response_model=PortfolioShareRead, status_code=201
)
def create_portfolio_share(
    body: PortfolioShareCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Link to chosen portfolio designs; optionally expiring."""
    business = _own_business(db, current_user)
    share_links.validate_future_expiry(body.expires_at)

    wanted = set(body.design_ids)
    q = select(Design.id).where(Design.id.in_(wanted))
    q = q.join(Client, Client.id == Design.client_id).where(
        Design.in_portfolio.is_(True)
    )
    q = restrict_to_accessible(q, current_user)
    if set(db.execute(q).scalars().all()) != wanted:
        raise HTTPException(status_code=404, detail="Design not found")

    share = PortfolioShare(
        business_id=business.id,
        token=share_links.new_token(),
        design_ids=sorted(str(d) for d in wanted),
        expires_at=body.expires_at,
        created_by_id=current_user.id,
        created_at=share_links.now(),
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return _share_to_read(share)


@router.delete("/portfolio-shares/{share_id}", status_code=204)
def revoke_portfolio_share(
    share_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    business = _own_business(db, current_user)
    share = (
        db.execute(
            select(PortfolioShare)
            .where(PortfolioShare.id == uuid.UUID(share_id))
            .where(PortfolioShare.business_id == business.id)
        )
        .scalars()
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")
    if share.revoked_at is None:
        share.revoked_at = share_links.now()
        db.commit()
    return Response(status_code=204)


@public_router.get("/portfolio/{token}", response_model=PortfolioView)
def view_portfolio(token: str, db: Session = Depends(get_db)):
    """Public showcase of the designs picked in an expiring share link."""
    unavailable = HTTPException(
        status_code=404, detail="Portfolio not available"
    )
    share = (
        db.execute(select(PortfolioShare).where(PortfolioShare.token == token))
        .scalars()
        .first()
    )
    if (
        not share
        or share.revoked_at is not None
        or share_links.is_expired(share.expires_at)
    ):
        raise unavailable
    business = db.get(Business, share.business_id)
    if not business or not business.is_active:
        raise unavailable
    return _portfolio_view(db, business, share.design_ids)


@public_router.get("/share/{token}", response_model=SharedView)
def view_shared(token: str, db: Session = Depends(get_db)):
    """Public, read-only view. Unknown, revoked and expired are all 404."""
    link = (
        db.execute(select(ShareLink).where(ShareLink.token == token))
        .scalars()
        .first()
    )
    if (
        not link
        or link.revoked_at is not None
        or share_links.is_expired(link.expires_at)
    ):
        raise HTTPException(status_code=404, detail="Link not available")

    client = db.get(Client, link.client_id)
    if not client or not client.is_active:
        raise HTTPException(status_code=404, detail="Link not available")
    business = (
        db.get(Business, client.business_id) if client.business_id else None
    )

    q = (
        select(Design)
        .options(
            selectinload(Design.hotspots).selectinload(DesignHotspot.material)
        )
        .where(Design.client_id == link.client_id)
        .order_by(Design.created_at.desc())
    )
    if link.design_ids:
        q = q.where(Design.id.in_([uuid.UUID(d) for d in link.design_ids]))
    designs = db.execute(q).scalars().all()

    return SharedView(
        business_name=business.name if business else None,
        project_name=client.name,
        show_prices=link.show_prices,
        designs=[
            SharedDesign(
                id=d.id,
                title=d.title,
                description=d.description,
                image_url=design_image_url(d),
                hotspots=[
                    _shared_hotspot(h, link.show_prices) for h in d.hotspots
                ],
            )
            for d in designs
        ],
    )
