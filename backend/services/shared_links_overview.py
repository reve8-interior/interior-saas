"""One list of every public link the business has out, whatever it shares."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.client import Client
from ..models.portfolio_share import PortfolioShare
from ..models.quotation import Quotation
from ..models.quotation_version import QuotationShare, QuotationVersion
from ..models.share_link import ShareLink
from ..models.user import User
from ..schemas.share import SharedLinkKind, SharedLinkRow
from . import share_links
from .client_access import restrict_to_accessible


def list_shared_links(db: Session, user: User) -> list[SharedLinkRow]:
    """Design, quotation and portfolio links, newest first.

    Stopped links are left out. Designers only see links on clients they can
    access; portfolio links belong to the business, so everyone sees them.
    """
    rows: list[SharedLinkRow] = []

    designs = (
        select(ShareLink, Client)
        .join(Client, Client.id == ShareLink.client_id)
        .where(ShareLink.revoked_at.is_(None))
    )
    for link, client in db.execute(restrict_to_accessible(designs, user)):
        count = len(link.design_ids) if link.design_ids else None
        rows.append(
            SharedLinkRow(
                kind=SharedLinkKind.designs,
                id=link.id,
                client_id=client.id,
                client_name=client.name,
                title=f"{count} design{'s' if count != 1 else ''}"
                if count
                else "All designs",
                url=share_links.public_url("share", link.token),
                show_prices=link.show_prices,
                expires_at=link.expires_at,
                created_at=link.created_at,
            )
        )

    quotes = (
        select(QuotationShare, QuotationVersion, Client)
        .join(
            QuotationVersion, QuotationShare.version_id == QuotationVersion.id
        )
        .join(Quotation, QuotationVersion.quotation_id == Quotation.id)
        .join(Client, Client.id == Quotation.client_id)
    )
    for share, version, client in db.execute(
        restrict_to_accessible(quotes, user)
    ):
        rows.append(
            SharedLinkRow(
                kind=SharedLinkKind.quotation,
                id=share.id,
                version_id=version.id,
                client_id=client.id,
                client_name=client.name,
                title=f"Quotation version {version.number}",
                url=share_links.public_url("quotation", share.token),
                show_prices=share.show_prices,
                expires_at=share.expires_at,
                created_at=share.created_at,
                view_count=share.view_count,
                last_viewed_at=share.last_viewed_at,
                response_kind=share.response_kind,
            )
        )

    if user.business_id:
        portfolio = select(PortfolioShare).where(
            PortfolioShare.business_id == user.business_id,
            PortfolioShare.revoked_at.is_(None),
        )
        for share in db.scalars(portfolio):
            count = len(share.design_ids)
            rows.append(
                SharedLinkRow(
                    kind=SharedLinkKind.portfolio,
                    id=share.id,
                    title=f"Portfolio · {count} design{'s' if count != 1 else ''}",
                    url=share_links.public_url("portfolio", share.token),
                    expires_at=share.expires_at,
                    created_at=share.created_at,
                )
            )

    rows.sort(key=lambda r: r.created_at, reverse=True)
    return rows
