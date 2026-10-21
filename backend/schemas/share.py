from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class ShareLinkCreate(BaseModel):
    # Omit to share every design of the client, including future ones.
    design_ids: list[UUID] | None = Field(default=None, min_length=1)
    show_prices: bool = False
    expires_at: datetime | None = None


class ShareLinkRead(BaseModel):
    id: UUID
    client_id: UUID
    url: str
    design_ids: list[UUID] | None
    show_prices: bool
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class SharedItem(BaseModel):
    """What a customer may see about a material; never the vendor."""

    name: str
    category: str
    unit: str
    unit_cost: Decimal | None = None


class SharedHotspot(BaseModel):
    id: UUID
    label: str
    notes: str | None
    dimensions: str | None = None
    # Hidden unless the share link shows prices.
    labour_cost: Decimal | None = None
    x: float
    y: float
    w: float
    h: float
    item: SharedItem | None = None


class SharedDesign(BaseModel):
    id: UUID
    title: str | None
    description: str | None
    image_url: str | None
    hotspots: list[SharedHotspot]


class PortfolioShareCreate(BaseModel):
    design_ids: list[UUID] = Field(min_length=1)
    expires_at: datetime | None = None


class PortfolioShareRead(BaseModel):
    id: UUID
    url: str
    design_ids: list[UUID]
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class PortfolioView(BaseModel):
    """Public portfolio: no client names, no rates."""

    business_name: str | None
    designs: list[SharedDesign]


class SharedView(BaseModel):
    business_name: str | None
    project_name: str
    show_prices: bool
    designs: list[SharedDesign]
