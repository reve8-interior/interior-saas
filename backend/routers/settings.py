"""Portal-wide settings endpoints.

GET/PUT /settings/line-item-columns — the user-configurable quotation
line-item column definitions (which columns exist, which are mandatory,
plus custom columns stored in quotation_line_items.extra).
"""

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from typing_extensions import Literal

from ..core import get_db
from ..models.app_setting import AppSetting
from ..models.user import User
from ..services.column_settings import (
    BUILTIN_COLUMN_KEYS,
    LINE_ITEM_COLUMNS_KEY,
    RESERVED_COLUMN_KEYS,
    get_line_item_columns,
)
from .deps import get_current_user

router = APIRouter()

_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,29}$")


class LineItemColumn(BaseModel):
    key: str = Field(min_length=1, max_length=30)
    label: str = Field(min_length=1, max_length=40)
    type: Literal["text", "number"] = "text"
    required: bool = False
    builtin: bool = False
    enabled: bool = True
    locked: bool = False

    @field_validator("key")
    @classmethod
    def key_is_slug(cls, v: str) -> str:
        if not _KEY_PATTERN.match(v):
            raise ValueError(
                "key must be a lowercase slug (letters, digits, underscore)"
            )
        return v


class LineItemColumnsPayload(BaseModel):
    columns: list[LineItemColumn]


@router.get(
    "/settings/line-item-columns", response_model=LineItemColumnsPayload
)
def get_columns(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    return LineItemColumnsPayload(columns=get_line_item_columns(db))


@router.put(
    "/settings/line-item-columns", response_model=LineItemColumnsPayload
)
def save_columns(
    body: LineItemColumnsPayload,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Replace the column definitions.

    Rules enforced here (mirrored in the Column Setup page):
    - every builtin column must be present exactly once;
    - room and description stay required, enabled, and locked;
    - custom keys must not collide with reserved line-item attributes.
    """
    keys = [c.key for c in body.columns]
    if len(keys) != len(set(keys)):
        raise HTTPException(status_code=422, detail="Duplicate column keys")

    present_builtins = {c.key for c in body.columns if c.builtin}
    if present_builtins != set(BUILTIN_COLUMN_KEYS):
        raise HTTPException(
            status_code=422,
            detail=(
                "All builtin columns must be present: "
                + ", ".join(BUILTIN_COLUMN_KEYS)
            ),
        )

    for col in body.columns:
        if col.key in ("room", "description") and (
            not col.required or not col.enabled
        ):
            raise HTTPException(
                status_code=422,
                detail="room and description must stay required and enabled",
            )
        if not col.builtin and col.key in RESERVED_COLUMN_KEYS:
            raise HTTPException(
                status_code=422,
                detail=f"'{col.key}' is a reserved column key",
            )

    value = {"columns": [c.model_dump() for c in body.columns]}
    row = db.get(AppSetting, LINE_ITEM_COLUMNS_KEY)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=LINE_ITEM_COLUMNS_KEY, value=value))
    db.commit()
    return LineItemColumnsPayload(columns=get_line_item_columns(db))
