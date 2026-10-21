import enum
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from ..models.quotation_line_item import (
    QuotationCatalogType,
    QuotationItemStatus,
)


class QuotationDerivedState(str, enum.Enum):
    """Quotation-level state computed from its line items on read."""

    draft = "draft"
    in_negotiation = "in_negotiation"
    clarification_needed = "clarification_needed"
    ready_for_approval = "ready_for_approval"


class QuotationLineItemCreate(BaseModel):
    room: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=500)
    unit: str = Field(min_length=1, max_length=20)
    catalog_type: QuotationCatalogType = QuotationCatalogType.core_works
    position: int = Field(default=0, ge=0)
    raw_dimension: str | None = Field(default=None, max_length=50)
    qty: float | None = Field(default=None, ge=0)
    rate: float | None = Field(default=None, ge=0)
    initial_price: float | None = Field(default=None, ge=0)
    negotiated_price: float | None = Field(default=None, ge=0)
    est_time: str | None = Field(default=None, max_length=50)
    remarks: str | None = Field(default=None, max_length=2000)
    extra: dict[str, str | float | None] = Field(default_factory=dict)
    material_id: UUID | None = Field(default=None)


class QuotationLineItemUpdate(BaseModel):
    """Partial update — only provided fields are applied."""

    room: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, min_length=1, max_length=500)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    catalog_type: QuotationCatalogType | None = None
    position: int | None = Field(default=None, ge=0)
    raw_dimension: str | None = Field(default=None, max_length=50)
    qty: float | None = Field(default=None, ge=0)
    rate: float | None = Field(default=None, ge=0)
    initial_price: float | None = Field(default=None, ge=0)
    negotiated_price: float | None = Field(default=None, ge=0)
    est_time: str | None = Field(default=None, max_length=50)
    remarks: str | None = Field(default=None, max_length=2000)
    extra: dict[str, str | float | None] | None = None
    status: QuotationItemStatus | None = None
    material_id: UUID | None = Field(default=None)


class QuotationLineItemRead(BaseModel):
    id: UUID
    quotation_id: UUID
    room: str
    position: int
    description: str
    catalog_type: QuotationCatalogType
    unit: str
    raw_dimension: str | None
    computed_sqft: float | None
    qty: float | None
    rate: float | None
    initial_price: float | None
    negotiated_price: float | None
    est_time: str | None
    remarks: str | None
    extra: dict[str, str | float | None] = Field(default_factory=dict)
    status: QuotationItemStatus
    material_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    # Unflushed ORM objects report extra=None (column default applies
    # at flush time) — normalize to an empty mapping.
    @field_validator("extra", mode="before")
    @classmethod
    def none_to_empty_dict(cls, v: object) -> object:
        return v if v is not None else {}


class QuotationRoomGroup(BaseModel):
    room: str
    items: list[QuotationLineItemRead]
    initial_total: float
    negotiated_total: float
    pending_clarity_count: int


class QuotationSnapshot(BaseModel):
    checkpoint_id: str
    created_at: str
    line_items: list[dict]


class DiffFieldChange(BaseModel):
    """One field that differs between the baseline and current item."""

    field: str
    old: str | float | None
    new: str | float | None


class QuotationDiffItem(BaseModel):
    """A line item as it appears on one side of a comparison."""

    room: str
    description: str
    # Live quotation line item this entry resolves to (None if gone)
    item_id: str | None = None
    unit: str | None = None
    raw_dimension: str | None = None
    qty: float | None = None
    rate: float | None = None
    initial_price: float | None = None
    negotiated_price: float | None = None
    est_time: str | None = None
    remarks: str | None = None
    extra: dict[str, str | float | None] = Field(default_factory=dict)
    status: str | None = None


class QuotationDiffChange(BaseModel):
    """An item present on both sides whose fields differ."""

    room: str
    description: str
    # Live quotation line item this entry resolves to (None if gone)
    item_id: str | None = None
    changes: list[DiffFieldChange]


class QuotationDiffResponse(BaseModel):
    """Added / removed / changed items vs a snapshot baseline."""

    quotation_id: UUID
    baseline_checkpoint_id: str | None
    baseline_created_at: str | None
    added: list[QuotationDiffItem]
    removed: list[QuotationDiffItem]
    changed: list[QuotationDiffChange]
    unchanged_count: int


class QuotationRead(BaseModel):
    """Full quotation view: metadata plus the room-grouped line items."""

    id: UUID
    client_id: UUID
    design_id: UUID | None
    checkpoint_id: UUID | None
    status: str
    created_at: datetime
    rooms: list[QuotationRoomGroup]
    initial_total: float
    negotiated_total: float
    pending_clarity_count: int
    derived_state: QuotationDerivedState
    snapshots: list[QuotationSnapshot]
