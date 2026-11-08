from typing import Literal

from pydantic import BaseModel, Field


class FloorPlanRoomOut(BaseModel):
    name: str
    length_ft: float | None = None
    width_ft: float | None = None
    notes: str | None = None
    # How the room relates to the quotation's own rooms. For "existing" and
    # "suggested", `name` is already the quotation's room and `plan_label`
    # is what the plan called it.
    match_status: Literal["existing", "suggested", "new"] = "new"
    plan_label: str | None = None


class FloorPlanExtractResponse(BaseModel):
    # Where the plan was stored; sent back when the draft is saved so the
    # meeting keeps the image it came from.
    source_image_path: str
    audit_log_id: str
    rooms: list[FloorPlanRoomOut]
    existing_rooms: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    model: str


class FloorPlanDraftRequest(BaseModel):
    """Rooms as confirmed (and possibly edited) by the designer."""

    rooms: list[FloorPlanRoomOut] = Field(min_length=1, max_length=40)


class DraftMatch(BaseModel):
    """A line already in the quotation that this starter row repeats."""

    # None when the repeat is a row in an earlier unverified draft, which
    # cannot be updated, only skipped or added again.
    id: str | None = None
    source: Literal["quotation", "draft"] = "quotation"
    summary: str
    # Values this row could fill in because the existing line has none:
    # a subset of raw_dimension, qty, rate. Empty means nothing to add.
    fills: list[str] = Field(default_factory=list)


class DraftItem(BaseModel):
    room: str
    description: str
    unit: str
    raw_dimension: str | None = None
    qty: float | None = None
    rate: float | None = None
    action: str = "add"
    match: DraftMatch | None = None


class FloorPlanDraftResponse(BaseModel):
    line_items: list[DraftItem]
    summary_text: str
    warnings: list[str] = Field(default_factory=list)
