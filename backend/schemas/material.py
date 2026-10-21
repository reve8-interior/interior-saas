from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class MaterialCreate(BaseModel):
    name: str
    category: str
    unit: str = "sqft"
    unit_cost: float
    vendor: str | None = None


class MaterialUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    unit: str | None = None
    unit_cost: float | None = None
    vendor: str | None = None


class MaterialRead(BaseModel):
    id: UUID
    name: str
    category: str
    unit: str
    unit_cost: float
    vendor: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class MarginConfigRead(BaseModel):
    id: UUID
    category: str | None
    margin_percent: float

    model_config = {"from_attributes": True}


class MarginConfigUpdate(BaseModel):
    category: str | None = None
    margin_percent: float


class MaterialBulkRow(BaseModel):
    name: str
    category: str
    unit: str
    unit_cost: float
    vendor: str | None = None


class MaterialBulkPreview(BaseModel):
    rows: list[MaterialBulkRow]
    errors: list[str] = []
