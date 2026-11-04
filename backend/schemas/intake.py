from typing import Literal

from pydantic import BaseModel, Field


class IntakeRowIn(BaseModel):
    room: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=500)


class IntakeCheckRequest(BaseModel):
    rows: list[IntakeRowIn] = Field(min_length=1, max_length=100)


class SimilarItem(BaseModel):
    id: str
    room: str
    description: str
    summary: str


class MaterialSuggestion(BaseModel):
    id: str
    name: str
    unit: str
    unit_cost: float


class IntakeRowOut(BaseModel):
    # The room to use: the quotation's own when the name matched one.
    room: str
    room_status: Literal["existing", "suggested", "new"]
    similar: SimilarItem | None = None
    # Catalogue material the description names, with its unit and rate.
    material: MaterialSuggestion | None = None


class IntakeCheckResponse(BaseModel):
    rows: list[IntakeRowOut]
