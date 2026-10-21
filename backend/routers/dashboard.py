from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core import get_db
from ..schemas.dashboard import DashboardStats
from ..services.dashboard_service import (
    get_activity_metrics,
    get_ai_cost_usd,
    get_ai_usage_metrics,
    get_avg_project_days,
    get_client_metrics,
    get_margin_metrics,
    get_revenue_metrics,
)
from .deps import get_current_user

router = APIRouter()


@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    total_clients, active_clients, new_this_month, clients_by_phase = (
        get_client_metrics(db)
    )
    approved_rev, pending_rev, revenue_by_phase = get_revenue_metrics(db)
    ai_total_calls, ai_input, ai_output, ai_latency, ai_by_op = (
        get_ai_usage_metrics(db)
    )
    global_margin, margins_by_category = get_margin_metrics(db)
    recent_checkpoints, quotations_pending = get_activity_metrics(db)
    avg_project_days = get_avg_project_days(db)

    return DashboardStats(
        total_clients=total_clients,
        active_clients=active_clients,
        clients_by_phase=clients_by_phase,
        new_this_month=new_this_month,
        total_revenue_approved=approved_rev,
        total_revenue_pending=pending_rev,
        revenue_by_phase=revenue_by_phase,
        ai_total_calls=ai_total_calls,
        ai_total_input_tokens=ai_input,
        ai_total_output_tokens=ai_output,
        ai_avg_latency_ms=ai_latency,
        ai_total_cost_usd=get_ai_cost_usd(db),
        ai_calls_by_operation=ai_by_op,
        global_margin_percent=global_margin,
        margins_by_category=margins_by_category,
        recent_checkpoints_30d=recent_checkpoints,
        quotations_pending=quotations_pending,
        avg_project_days=avg_project_days,
    )
