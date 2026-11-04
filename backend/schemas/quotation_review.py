from typing import Literal

from pydantic import BaseModel, Field

FindingSeverity = Literal["error", "warning", "info"]


class ReviewFinding(BaseModel):
    code: str
    severity: FindingSeverity
    message: str
    room: str | None = None
    item_id: str | None = None


class QuotationReview(BaseModel):
    findings: list[ReviewFinding] = Field(default_factory=list)
    items_checked: int
