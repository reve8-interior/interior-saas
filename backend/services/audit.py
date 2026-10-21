"""Audit trail: who did what inside which business."""

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.audit import AuditLog
from ..models.user import User
from ..schemas.business_user import AuditEntryRead, AuditPage

MAX_PAGE = 200


def record(
    db: Session,
    *,
    actor: User | None,
    business_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: object | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    """Queue an audit row on the caller's transaction (no commit).

    Never put secrets in payload: it is shown to business admins.
    """
    db.add(
        AuditLog(
            user_id=actor.id if actor else None,
            business_id=business_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            payload=payload or {},
            timestamp=datetime.now(timezone.utc),
        )
    )


def list_entries(
    db: Session,
    business_id: uuid.UUID,
    *,
    limit: int = 50,
    offset: int = 0,
    action: str | None = None,
    actor_id: uuid.UUID | None = None,
) -> AuditPage:
    """Newest-first slice of a business's audit trail."""
    if limit < 1 or limit > MAX_PAGE or offset < 0:
        raise HTTPException(status_code=422, detail="Invalid paging")
    where = [AuditLog.business_id == business_id]
    if action:
        # A prefix such as "team" matches every "team.*" action.
        where.append(
            AuditLog.action.like(f"{action}.%") | (AuditLog.action == action)
        )
    if actor_id:
        where.append(AuditLog.user_id == actor_id)
    total = db.scalar(select(func.count(AuditLog.id)).where(*where)) or 0
    rows = db.execute(
        select(AuditLog, User.email, User.full_name)
        .outerjoin(User, User.id == AuditLog.user_id)
        .where(*where)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return AuditPage(
        total=total,
        items=[
            AuditEntryRead(
                id=log.id,
                timestamp=log.timestamp,
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                payload=log.payload or {},
                actor_id=log.user_id,
                actor_email=email,
                actor_name=name,
            )
            for log, email, name in rows
        ],
    )
