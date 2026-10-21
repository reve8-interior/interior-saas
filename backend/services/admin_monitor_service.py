"""Platform-wide usage metrics for the superadmin console.

Clients belong to a business via Client.business_id. Clients with no
business are reported under an "Unassigned" bucket.
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.agent_audit_log import AgentAuditLog
from ..models.business import Business
from ..models.checkpoint import Checkpoint
from ..models.client import Client
from ..models.quotation import Quotation
from ..models.user import User
from ..schemas.admin_monitor import (
    AdminOverview,
    BusinessAIUsage,
    BusinessClientRow,
    BusinessUsage,
    DailyUsage,
    OperationUsage,
    PlatformTotals,
    RecentCall,
)

UNASSIGNED = "Unassigned clients"

_COST = func.coalesce(func.sum(AgentAuditLog.cost_usd), 0)

_TOKENS = func.coalesce(
    func.sum(
        func.coalesce(AgentAuditLog.input_tokens, 0)
        + func.coalesce(AgentAuditLog.output_tokens, 0)
    ),
    0,
)


def _count(db: Session, model: type) -> int:
    return db.scalar(select(func.count(model.id))) or 0


def _by_business(db: Session, query) -> dict[uuid.UUID | None, tuple]:
    """Run a (business_id, *metrics) grouped query into a lookup dict."""
    return {row[0]: tuple(row[1:]) for row in db.execute(query).all()}


def get_overview(db: Session) -> AdminOverview:
    users = _by_business(
        db,
        select(User.business_id, func.count(User.id)).group_by(
            User.business_id
        ),
    )
    clients = _by_business(
        db,
        select(
            Client.business_id,
            func.count(Client.id),
            func.count(Client.id).filter(Client.is_active.is_(True)),
            func.max(Client.updated_at),
        ).group_by(Client.business_id),
    )
    quotations = _by_business(
        db,
        select(Client.business_id, func.count(Quotation.id))
        .select_from(Quotation)
        .join(Client, Quotation.client_id == Client.id)
        .group_by(Client.business_id),
    )
    checkpoints = _by_business(
        db,
        select(Client.business_id, func.count(Checkpoint.id))
        .select_from(Checkpoint)
        .join(Client, Checkpoint.client_id == Client.id)
        .group_by(Client.business_id),
    )
    ai = _by_business(
        db,
        select(
            AgentAuditLog.business_id,
            func.count(AgentAuditLog.id),
            _TOKENS,
            func.max(AgentAuditLog.timestamp),
            _COST,
        ).group_by(AgentAuditLog.business_id),
    )

    def row(
        business_id: uuid.UUID | None, name: str, is_active: bool
    ) -> BusinessUsage:
        c = clients.get(business_id, (0, 0, None))
        a = ai.get(business_id, (0, 0, None, 0))
        stamps: list[datetime] = [t for t in (c[2], a[2]) if t is not None]
        return BusinessUsage(
            id=business_id,
            name=name,
            is_active=is_active,
            users=users.get(business_id, (0,))[0],
            clients=c[0],
            active_clients=c[1],
            quotations=quotations.get(business_id, (0,))[0],
            checkpoints=checkpoints.get(business_id, (0,))[0],
            ai_calls=a[0],
            ai_tokens=int(a[1]),
            ai_cost_usd=float(a[3]),
            last_activity=max(stamps) if stamps else None,
        )

    businesses = db.execute(select(Business).order_by(Business.name)).scalars()
    rows = [row(b.id, b.name, b.is_active) for b in businesses]
    if None in clients:
        rows.append(row(None, UNASSIGNED, True))

    ai_ops = {
        op: n
        for op, n in db.execute(
            select(
                AgentAuditLog.operation, func.count(AgentAuditLog.id)
            ).group_by(AgentAuditLog.operation)
        ).all()
    }
    totals = PlatformTotals(
        businesses=_count(db, Business),
        active_businesses=db.scalar(
            select(func.count(Business.id)).where(Business.is_active.is_(True))
        )
        or 0,
        users=_count(db, User),
        clients=_count(db, Client),
        quotations=_count(db, Quotation),
        checkpoints=_count(db, Checkpoint),
        ai_calls=_count(db, AgentAuditLog),
        ai_tokens=int(db.scalar(select(_TOKENS)) or 0),
        ai_cost_usd=float(db.scalar(select(_COST)) or 0),
    )
    return AdminOverview(
        totals=totals, businesses=rows, ai_calls_by_operation=ai_ops
    )


def get_business_clients(
    db: Session, business_id: uuid.UUID | None
) -> list[BusinessClientRow]:
    """Clients of one business (or the unassigned bucket) with contact + usage."""
    q = (
        select(Client, User.email)
        .outerjoin(User, Client.assigned_designer_id == User.id)
        .where(
            Client.business_id == business_id
            if business_id
            else Client.business_id.is_(None)
        )
        .order_by(Client.created_at.desc())
    )
    ai_counts = dict(
        db.execute(
            select(
                AgentAuditLog.client_id, func.count(AgentAuditLog.id)
            ).group_by(AgentAuditLog.client_id)
        ).all()
    )
    return [
        BusinessClientRow(
            id=client.id,
            name=client.name,
            phase=str(
                getattr(client.current_phase, "value", client.current_phase)
            ),
            is_active=client.is_active,
            contact_info=client.contact_info or {},
            designer_email=designer_email,
            quotations=len(client.quotations),
            checkpoints=len(client.checkpoints),
            ai_calls=ai_counts.get(client.id, 0),
            created_at=client.created_at,
        )
        for client, designer_email in db.execute(q).all()
    ]


def get_business_ai_usage(
    db: Session, business_id: uuid.UUID, days: int
) -> BusinessAIUsage:
    """AI usage for one business over the last `days` days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    window = (
        AgentAuditLog.business_id == business_id,
        AgentAuditLog.timestamp >= since,
    )
    is_error = AgentAuditLog.status != "success"
    in_tok = func.coalesce(func.sum(AgentAuditLog.input_tokens), 0)
    out_tok = func.coalesce(func.sum(AgentAuditLog.output_tokens), 0)

    ops = [
        OperationUsage(
            operation=op,
            calls=calls,
            errors=errors,
            input_tokens=int(i),
            output_tokens=int(o),
            cost_usd=float(cost),
        )
        for op, calls, errors, i, o, cost in db.execute(
            select(
                AgentAuditLog.operation,
                func.count(AgentAuditLog.id),
                func.count(AgentAuditLog.id).filter(is_error),
                in_tok,
                out_tok,
                _COST,
            )
            .where(*window)
            .group_by(AgentAuditLog.operation)
            .order_by(func.count(AgentAuditLog.id).desc())
        ).all()
    ]

    day = func.date(AgentAuditLog.timestamp)
    daily_rows = {
        d: (calls, int(tokens), float(cost))
        for d, calls, tokens, cost in db.execute(
            select(
                day,
                func.count(AgentAuditLog.id),
                func.coalesce(
                    func.sum(
                        func.coalesce(AgentAuditLog.input_tokens, 0)
                        + func.coalesce(AgentAuditLog.output_tokens, 0)
                    ),
                    0,
                ),
                _COST,
            )
            .where(*window)
            .group_by(day)
        ).all()
    }
    today = datetime.now(timezone.utc).date()
    daily = [
        DailyUsage(
            day=d,
            calls=daily_rows.get(d, (0, 0, 0.0))[0],
            tokens=daily_rows.get(d, (0, 0, 0.0))[1],
            cost_usd=daily_rows.get(d, (0, 0, 0.0))[2],
        )
        for d in (today - timedelta(days=n) for n in range(days - 1, -1, -1))
    ]

    recent = [
        RecentCall(
            timestamp=log.timestamp,
            operation=log.operation,
            model=log.model,
            status=log.status,
            input_tokens=log.input_tokens,
            output_tokens=log.output_tokens,
            latency_ms=log.latency_ms,
            cost_usd=(
                float(log.cost_usd) if log.cost_usd is not None else None
            ),
            client_name=client_name,
        )
        for log, client_name in db.execute(
            select(AgentAuditLog, Client.name)
            .outerjoin(Client, AgentAuditLog.client_id == Client.id)
            .where(*window)
            .order_by(AgentAuditLog.timestamp.desc())
            .limit(25)
        ).all()
    ]

    avg_latency = db.scalar(
        select(func.coalesce(func.avg(AgentAuditLog.latency_ms), 0)).where(
            *window
        )
    )
    return BusinessAIUsage(
        days=days,
        calls=sum(o.calls for o in ops),
        errors=sum(o.errors for o in ops),
        input_tokens=sum(o.input_tokens for o in ops),
        output_tokens=sum(o.output_tokens for o in ops),
        avg_latency_ms=float(avg_latency or 0),
        cost_usd=sum(o.cost_usd for o in ops),
        by_operation=ops,
        daily=daily,
        recent=recent,
    )
