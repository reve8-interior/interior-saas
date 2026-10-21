"""
Dashboard aggregate metrics: one query function per metric group.

Routers stay thin; the SQL that feeds /api/v1/dashboard/stats lives here
so it can be unit-tested without HTTP.
"""

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.agent_audit_log import AgentAuditLog
from ..models.checkpoint import Checkpoint
from ..models.client import Client
from ..models.margin import MarginConfig
from ..models.quotation import Quotation, QuotationStatus
from ..models.quotation_line_item import QuotationLineItem


def get_client_metrics(db: Session) -> tuple[int, int, int, dict[str, int]]:
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # One grouped query; totals are summed from the per-phase rows.
    rows = db.execute(
        select(
            Client.current_phase,
            func.count(Client.id),
            func.count(Client.id).filter(Client.is_active.is_(True)),
            func.count(Client.id).filter(Client.created_at >= month_start),
        ).group_by(Client.current_phase)
    ).all()
    clients_by_phase = {row[0]: row[1] for row in rows}
    total_clients = sum(row[1] for row in rows)
    active_clients = sum(row[2] for row in rows)
    new_this_month = sum(row[3] for row in rows)

    return total_clients, active_clients, new_this_month, clients_by_phase


def get_revenue_metrics(db: Session) -> tuple[float, float, dict[str, float]]:
    # Approved uses negotiated price first, pending uses initial price first.
    approved_price = func.coalesce(
        QuotationLineItem.negotiated_price, QuotationLineItem.initial_price
    )
    pending_price = func.coalesce(
        QuotationLineItem.initial_price, QuotationLineItem.negotiated_price
    )
    approved_rev, pending_rev = db.execute(
        select(
            func.coalesce(
                func.sum(approved_price).filter(
                    Quotation.status == QuotationStatus.approved
                ),
                0,
            ),
            func.coalesce(
                func.sum(pending_price).filter(
                    Quotation.status == QuotationStatus.pending
                ),
                0,
            ),
        )
        .select_from(QuotationLineItem)
        .join(Quotation, QuotationLineItem.quotation_id == Quotation.id)
    ).one()

    # Revenue by phase: join client -> quotation -> line_items, group by client.current_phase
    rev_phase_rows = db.execute(
        select(
            Client.current_phase,
            func.coalesce(
                func.sum(
                    func.coalesce(
                        QuotationLineItem.negotiated_price,
                        QuotationLineItem.initial_price,
                    )
                ),
                0,
            ),
        )
        .join(Quotation, Client.id == Quotation.client_id)
        .join(
            QuotationLineItem, Quotation.id == QuotationLineItem.quotation_id
        )
        .group_by(Client.current_phase)
    ).all()
    revenue_by_phase = {row[0]: float(row[1]) for row in rev_phase_rows}

    return float(approved_rev), float(pending_rev), revenue_by_phase


def get_ai_usage_metrics(
    db: Session,
) -> tuple[int, int, int, float, dict[str, int]]:

    # --- AI Usage metrics ---
    ai_total_calls, ai_total_input, ai_total_output, ai_avg_latency = (
        db.execute(
            select(
                func.count(AgentAuditLog.id),
                func.coalesce(func.sum(AgentAuditLog.input_tokens), 0),
                func.coalesce(func.sum(AgentAuditLog.output_tokens), 0),
                func.coalesce(func.avg(AgentAuditLog.latency_ms), 0),
            )
        ).one()
    )

    ai_op_rows = db.execute(
        select(AgentAuditLog.operation, func.count(AgentAuditLog.id)).group_by(
            AgentAuditLog.operation
        )
    ).all()
    ai_calls_by_operation = {row[0]: row[1] for row in ai_op_rows}

    return (
        ai_total_calls,
        ai_total_input,
        ai_total_output,
        float(ai_avg_latency),
        ai_calls_by_operation,
    )


def get_ai_cost_usd(db: Session) -> float:
    """Total AI spend (USD) across the scoped business's logged calls."""
    return float(
        db.scalar(select(func.coalesce(func.sum(AgentAuditLog.cost_usd), 0)))
        or 0
    )


def get_margin_metrics(db: Session) -> tuple[float | None, dict[str, float]]:

    # --- Margin metrics ---
    margin_rows = db.execute(select(MarginConfig)).scalars().all()
    global_margin_percent = None
    margins_by_category: dict[str, float] = {}
    for m in margin_rows:
        if m.category is None:
            global_margin_percent = float(m.margin_percent)
        else:
            margins_by_category[m.category] = float(m.margin_percent)
    return global_margin_percent, margins_by_category


def get_activity_metrics(db: Session) -> tuple[int, int]:
    now = datetime.utcnow()

    # --- Activity metrics ---
    thirty_days_ago = now - timedelta(days=30)

    recent_checkpoints = (
        db.scalar(
            select(func.count(Checkpoint.id)).where(
                Checkpoint.created_at >= thirty_days_ago
            )
        )
        or 0
    )
    quotations_pending = (
        db.scalar(
            select(func.count(Quotation.id)).where(
                Quotation.status == QuotationStatus.pending
            )
        )
        or 0
    )

    return recent_checkpoints, quotations_pending


def get_avg_project_days(db: Session) -> float:

    # --- Average project completion time ---
    avg_project_days = (
        db.scalar(
            select(
                func.avg(
                    func.extract(
                        "epoch", Client.completed_at - Client.created_at
                    )
                    / 86400
                )
            ).where(Client.completed_at.isnot(None))
        )
        or 0
    )
    return float(avg_project_days)
