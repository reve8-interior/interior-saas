"""Request/response schemas for the AI checkpoint endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class ExtractedLineItemOut(BaseModel):
    # What the client did to the quotation: add new work, change an
    # existing item, or drop one. Drives merge behaviour downstream.
    action: str
    # The live quotation line item this row edits (null for new work).
    target_item_id: str | None
    # Human-readable summary of the item as it stands today, shown next
    # to an update so the verifier can see what is changing.
    target_summary: str | None
    room: str
    description: str
    unit: str | None
    raw_dimension: str | None
    qty: float | None
    rate: float | None
    est_time: str | None
    remarks: str | None
    # Total price the client agreed to for this item, if they did.
    agreed_price: float | None = None


class ExtractedQuestionOut(BaseModel):
    """Something the notes leave open, put to the designer."""

    question: str
    # A sentence the designer can add to the notes to settle it.
    suggested_note: str | None = None


class MaterialHint(BaseModel):
    name: str
    category: str
    unit: str
    unit_cost: float


class ExtractionScopeOut(BaseModel):
    """What slice of the quotation the agent was actually shown."""

    total_items: int
    items_in_context: int
    matched_rooms: list[str]


class ExtractionResponse(BaseModel):
    audit_log_id: str
    transcript: str
    meeting_minutes: list[str]
    line_items: list[ExtractedLineItemOut]
    client_budget: float | None
    material_hints: list[MaterialHint]
    # Scope-relevant statements the agent could not turn into an item.
    unmapped_notes: list[str]
    # Deterministic corrections applied after the model returned.
    warnings: list[str]
    # Ambiguities to settle before trusting the rows.
    questions: list[ExtractedQuestionOut] = Field(default_factory=list)
    scope: ExtractionScopeOut
    model: str


class ConfirmLineItem(BaseModel):
    room: str
    description: str
    # May be blank when the agent had no basis for a unit; whether that
    # blocks the save is decided by missing_required_problems.
    unit: str = ""
    raw_dimension: str | None = None
    qty: float | None = None
    rate: float | None = None
    est_time: str | None = None
    remarks: str | None = None
    agreed_price: float | None = None
    catalog_type: str = "core_works"
    action: str = "add"
    target_item_id: str | None = None
    # Values for user-defined custom columns (services.column_settings)
    extra: dict[str, str | float | None] = Field(default_factory=dict)

    # Which columns are mandatory is user-configurable (see
    # services.column_settings) and checked via missing_required_problems
    # — here we only normalize whitespace so blanks are detectable.
    @field_validator("room", "description", "unit", mode="before")
    @classmethod
    def strip_whitespace(cls, v: object) -> object:
        if v is None:
            return ""
        return v.strip() if isinstance(v, str) else v

    @field_validator("action", mode="before")
    @classmethod
    def known_action(cls, v: object) -> str:
        action = str(v or "add").strip().lower()
        return action if action in ("add", "update", "remove") else "add"


class FromExtractionRequest(BaseModel):
    summary_text: str
    raw_transcript: str
    audio_transcript: str | None = None
    line_items: list[ConfirmLineItem]
    client_budget: float | None = None
    unmapped_notes: list[str] = Field(default_factory=list)
    questions: list[ExtractedQuestionOut] = Field(default_factory=list)
    # kept for API compat; ignored — we always upsert
    create_quotation: bool = True


class FromExtractionResponse(BaseModel):
    checkpoint_id: str
    quotation_id: str | None
    # how the quotation was handled
    quotation_action: str  # "created" | "updated" | "none"
    items_added: int = 0
    items_updated: int = 0


class RevertResponse(BaseModel):
    quotation_id: str
    reverted_to_checkpoint_id: str
    items_restored: int


class RemoveCheckpointResponse(BaseModel):
    quotation_id: str
    checkpoint_id: str
    items_restored: int


class UpdateQuotationItemsRequest(BaseModel):
    checkpoint_id: str
    line_items: list[ConfirmLineItem]


class UpdateQuotationItemsResponse(BaseModel):
    quotation_id: str
    action: str  # "created" | "updated"
    items_count: int
    items_added: int = 0
    items_updated: int = 0
    items_removed: int = 0
    # Rows that edited an item deleted since the notes were read.
    items_skipped: int = 0
