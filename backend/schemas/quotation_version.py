from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from .quotation import QuotationLineItemRead
from .share import SharedDesign


class QuotationVersionCreate(BaseModel):
    label: str | None = Field(default=None, max_length=120)
    # Room name -> client designs to show with that room. Omit to use each
    # design's own room tags.
    room_designs: dict[str, list[UUID]] | None = None


class QuotationVersionDesignsUpdate(BaseModel):
    room_designs: dict[str, list[UUID]]


class QuotationVersionSummary(BaseModel):
    id: UUID
    quotation_id: UUID
    number: int
    label: str | None
    item_count: int
    room_designs: dict[str, list[UUID]]
    initial_total: float
    negotiated_total: float
    checkpoint_id: UUID | None
    is_active: bool
    is_agreed: bool
    agreed_at: datetime | None
    created_at: datetime


class QuotationVersionActiveUpdate(BaseModel):
    is_active: bool


class QuotationVersionRead(QuotationVersionSummary):
    line_items: list[QuotationLineItemRead]


class QuotationShareCreate(BaseModel):
    show_prices: bool = False
    expires_at: datetime | None = None


class QuotationShareRead(BaseModel):
    id: UUID
    version_id: UUID
    url: str
    show_prices: bool
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class SharedQuotationItem(BaseModel):
    """A line as the customer sees it; money fields only with prices on."""

    description: str
    unit: str
    raw_dimension: str | None
    qty: float | None
    est_time: str | None
    rate: float | None = None
    amount: float | None = None


class SharedQuotationRoom(BaseModel):
    room: str
    items: list[SharedQuotationItem]
    total: float | None = None
    designs: list[SharedDesign] = Field(default_factory=list)


class SharedQuotationView(BaseModel):
    business_name: str | None
    project_name: str
    version_number: int
    label: str | None
    created_at: datetime
    show_prices: bool
    is_agreed: bool = False
    rooms: list[SharedQuotationRoom]
    total: float | None = None
