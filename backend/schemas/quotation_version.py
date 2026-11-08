from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

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
    # A live customer link points at this version (at most one per quotation).
    is_shared: bool = False
    # The customer's latest answer on that link, so the list can show it.
    reply_kind: str | None = None
    reply_name: str | None = None
    reply_message: str | None = None
    replied_at: datetime | None = None


class QuotationVersionRestoreResult(BaseModel):
    restored_number: int
    items_restored: int
    backup: QuotationVersionSummary | None


class QuotationVersionActiveUpdate(BaseModel):
    is_active: bool


class QuotationVersionRead(QuotationVersionSummary):
    line_items: list[QuotationLineItemRead]


class QuotationShareCreate(BaseModel):
    show_prices: bool = False
    expires_at: datetime | None = None


class QuotationShareUpdate(BaseModel):
    """Change when a link stops working; null makes it open-ended."""

    expires_at: datetime | None = None


class QuotationShareRead(BaseModel):
    id: UUID
    version_id: UUID
    url: str
    show_prices: bool
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
    view_count: int = 0
    last_viewed_at: datetime | None = None
    response_kind: str | None = None
    response_name: str | None = None
    response_message: str | None = None
    responded_at: datetime | None = None


class QuotationShareResponse(BaseModel):
    """What a customer sends back from the public page."""

    kind: Literal["approved", "question"]
    name: str = Field(min_length=1, max_length=120)
    message: str | None = Field(default=None, max_length=2000)
    # Set when the question is about one line ("Room · description").
    item_label: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def question_needs_text(self) -> "QuotationShareResponse":
        if self.kind == "question" and not (self.message or "").strip():
            raise ValueError("Please write your question")
        if self.item_label and self.kind != "question":
            raise ValueError("Only a question can be about one line")
        return self


class QuotationMessageRead(BaseModel):
    """One customer message, kept even after a newer one arrives."""

    id: UUID
    version_id: UUID | None
    version_number: int
    kind: Literal["approved", "question"]
    name: str
    message: str | None
    item_label: str | None = None
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by_name: str | None = None


class QuotationMessageResolve(BaseModel):
    resolved: bool


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
    contact_email: str | None = None
    contact_phone: str | None = None
    responded_kind: str | None = None
    project_name: str
    version_number: int
    label: str | None
    created_at: datetime
    show_prices: bool
    is_agreed: bool = False
    rooms: list[SharedQuotationRoom]
    total: float | None = None
