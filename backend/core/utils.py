import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def parse_uuid(value: str | None, label: str = "identifier") -> uuid.UUID:
    if not value:
        raise HTTPException(status_code=400, detail=f"Missing {label}")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid {label}"
        ) from exc


def paginate(
    db: Session,
    query: Any,
    page: int,
    per_page: int,
) -> tuple[Any, int]:
    total = db.execute(
        select(func.count()).select_from(query.subquery())
    ).scalar_one()
    records = (
        db.execute(query.offset((page - 1) * per_page).limit(per_page))
        .scalars()
        .all()
    )
    return records, total
