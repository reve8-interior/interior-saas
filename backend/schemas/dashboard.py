from pydantic import BaseModel


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
