from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, Self
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, model_validator

from ..models.quotation_line_item import QuotationCatalogType


class DesignCreate(BaseModel):
    title: str | None = None
    image_url: str | None = None
    specs_json: dict[str, Any] = {}
    description: str | None = None
    source: str = "designer_uploaded"


class HotspotMaterial(BaseModel):
    id: UUID
    name: str
    category: str
    unit: str
    unit_cost: Decimal

    model_config = {"from_attributes": True}


class HotspotBase(BaseModel):
    """Region of the image as fractions (0-1) of its width and height."""

    label: str = Field(min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)
    material_id: UUID | None = None
    dimensions: str | None = Field(default=None, max_length=100)
    labour_cost: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    # w = h = 0 is a point pin rather than a box.
    w: float = Field(default=0, ge=0, le=1)
    h: float = Field(default=0, ge=0, le=1)

    @model_validator(mode="after")
    def _inside_image(self) -> Self:
        if self.x + self.w > 1.0001 or self.y + self.h > 1.0001:
            raise ValueError("Hotspot must stay inside the image")
        return self


class HotspotCreate(HotspotBase):
    pass


class HotspotUpdate(HotspotBase):
    pass


class HotspotQuotationAdd(BaseModel):
    """What the designer confirms when adding a hotspot to the quotation.

    Anything left out falls back to the hotspot: the label for the
    description, its material's unit and rate, and its notes for remarks.
    """

    room: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, min_length=1, max_length=500)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    catalog_type: QuotationCatalogType = QuotationCatalogType.core_works
    raw_dimension: str | None = Field(default=None, max_length=50)
    qty: float | None = Field(default=None, ge=0)
    rate: float | None = Field(default=None, ge=0)
    remarks: str | None = Field(default=None, max_length=2000)


class DesignPortfolioUpdate(BaseModel):
    in_portfolio: bool


class DesignRoomsUpdate(BaseModel):
    rooms: list[
        Annotated[
            str,
            StringConstraints(
                strip_whitespace=True, min_length=1, max_length=100
            ),
        ]
    ] = Field(max_length=30)


class HotspotRead(BaseModel):
    id: UUID
    design_id: UUID
    material_id: UUID | None
    quotation_line_item_id: UUID | None = None
    label: str
    notes: str | None
    dimensions: str | None = None
    labour_cost: Decimal | None = None
    x: float
    y: float
    w: float
    h: float
    material: HotspotMaterial | None = None

    model_config = {"from_attributes": True}


class DesignRead(BaseModel):
    id: UUID
    client_id: UUID
    source: str
    title: str | None
    image_url: str | None
    specs_json: dict[str, Any]
    is_selected: bool
    in_portfolio: bool
    rooms: list[str] = []
    description: str | None
    created_at: datetime
    hotspots: list[HotspotRead] = []

    model_config = {"from_attributes": True}


class PortfolioDesignRead(DesignRead):
    """A design plus its owner, for the designer's portfolio manager."""

    client_name: str
