from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class PlatformTotals(BaseModel):
    businesses: int
    active_businesses: int
    users: int
    clients: int
    quotations: int
    checkpoints: int
    ai_calls: int
    ai_tokens: int
    ai_cost_usd: float


class BusinessUsage(BaseModel):
    id: UUID | None  # None = clients not assigned to any business's designer
    name: str
    is_active: bool
    users: int
    clients: int
    active_clients: int
    quotations: int
    checkpoints: int
    ai_calls: int
    ai_tokens: int
    ai_cost_usd: float
    last_activity: datetime | None


class AdminOverview(BaseModel):
    totals: PlatformTotals
    businesses: list[BusinessUsage]
    ai_calls_by_operation: dict[str, int]


class BusinessClientRow(BaseModel):
    id: UUID
    name: str
    phase: str
    is_active: bool
    contact_info: dict[str, object]
    designer_email: str | None
    quotations: int
    checkpoints: int
    ai_calls: int
    created_at: datetime


class OperationUsage(BaseModel):
    operation: str
    calls: int
    errors: int
    input_tokens: int
    output_tokens: int
    cost_usd: float


class DailyUsage(BaseModel):
    day: date
    calls: int
    tokens: int
    cost_usd: float


class RecentCall(BaseModel):
    timestamp: datetime
    operation: str
    model: str
    status: str
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: int | None
    cost_usd: float | None
    client_name: str | None


class BusinessAIUsage(BaseModel):
    days: int
    calls: int
    errors: int
    input_tokens: int
    output_tokens: int
    avg_latency_ms: float
    cost_usd: float
    by_operation: list[OperationUsage]
    daily: list[DailyUsage]
    recent: list[RecentCall]
