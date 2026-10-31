import enum
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class DashboardStats(BaseModel):
    # Clients
    total_clients: int
    active_clients: int
    clients_by_phase: dict[str, int]
    new_this_month: int

    # Revenue
    total_revenue_approved: float
    total_revenue_pending: float
    revenue_by_phase: dict[str, float]

    # AI Usage
    ai_total_calls: int
    ai_total_input_tokens: int
    ai_total_output_tokens: int
    ai_avg_latency_ms: float
    ai_total_cost_usd: float
    ai_calls_by_operation: dict[str, int]

    # Margins
    global_margin_percent: float | None
    margins_by_category: dict[str, float]

    # Activity
    recent_checkpoints_30d: int
    quotations_pending: int
    avg_project_days: float


class AttentionKind(str, enum.Enum):
    """Declaration order is display priority."""

    customer_question = "customer_question"
    customer_approved = "customer_approved"
    link_expiring = "link_expiring"
    needs_clarity = "needs_clarity"


class AttentionItem(BaseModel):
    kind: AttentionKind
    client_id: uuid.UUID
    client_name: str
    title: str
    detail: str | None
    at: datetime | None
    # Frontend route that resolves the item.
    path: str
    # Names the item and its state; a new reply gets a new key.
    key: str
    read: bool = False


class AttentionMarkRead(BaseModel):
    keys: list[str] = Field(min_length=1, max_length=100)
