from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ..core import get_db
from ..models.user import User
from ..schemas.dashboard import (
    AttentionItem,
    AttentionMarkRead,
    DashboardStats,
)
from ..services.attention_service import get_attention_items, mark_read
from ..services.dashboard_service import (
    get_activity_metrics,
    get_ai_usage_and_cost,
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
    ai_total_calls, ai_input, ai_output, ai_latency, ai_by_op, ai_cost = (
        get_ai_usage_and_cost(db)
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
        ai_total_cost_usd=ai_cost,
        ai_calls_by_operation=ai_by_op,
        global_margin_percent=global_margin,
        margins_by_category=margins_by_category,
        recent_checkpoints_30d=recent_checkpoints,
        quotations_pending=quotations_pending,
        avg_project_days=avg_project_days,
    )


@router.get("/attention", response_model=list[AttentionItem])
def get_dashboard_attention(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_attention_items(db, current_user)


@router.post("/attention/read", status_code=204)
def mark_attention_read(
    body: AttentionMarkRead,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark items read for the caller only; teammates keep their own state."""
    mark_read(db, current_user, body.keys)
    return Response(status_code=204)
