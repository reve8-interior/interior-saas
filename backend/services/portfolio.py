"""Portfolio design query and public image URLs shared by public views."""

import uuid

from sqlalchemy import Select, select
from sqlalchemy.orm import selectinload

from ..models.client import Client
from ..models.design import Design, DesignHotspot
from .storage import signed_thumb_url, signed_view_url

# Placed designs first by position, the rest newest first.
PORTFOLIO_ORDER = (
    Design.portfolio_position.asc().nulls_last(),
    Design.created_at.desc(),
)


def design_view_url(design: Design) -> str | None:
    """Signed URL for the lighter image customers load on shared pages."""
    if design.storage_path:
        return signed_view_url(design.storage_path)
    return design.image_url


def design_thumb_url(design: Design) -> str | None:
    """Signed URL for a small preview; legacy external images stay as is."""
    if design.storage_path:
        return signed_thumb_url(design.storage_path)
    return design.image_url


def portfolio_designs_q(
    business_id: uuid.UUID, *, with_hotspots: bool = True
) -> Select:
    """Opted-in designs of one business's active clients, in portfolio order.

    Filters business_id explicitly: public callers run without RLS scope.
    """
    q = (
        select(Design)
        .join(Client, Client.id == Design.client_id)
        .where(Client.business_id == business_id)
        .where(Design.business_id == business_id)
        .where(Client.is_active.is_(True))
        .where(Design.in_portfolio.is_(True))
        .order_by(*PORTFOLIO_ORDER)
    )
    if with_hotspots:
        q = q.options(
            selectinload(Design.hotspots).selectinload(DesignHotspot.material)
        )
    return q
