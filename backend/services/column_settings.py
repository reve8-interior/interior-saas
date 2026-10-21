"""
User-configurable quotation line-item columns.

The portal owner decides which columns exist, which are mandatory, and
can add custom columns (stored per item in quotation_line_items.extra).
Definitions persist in app_settings under LINE_ITEM_COLUMNS_KEY; when
unset, DEFAULT_LINE_ITEM_COLUMNS applies.

Keep DEFAULT_LINE_ITEM_COLUMNS in sync with
frontend/src/lib/lineItemColumns.ts.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..models.app_setting import AppSetting

LINE_ITEM_COLUMNS_KEY = "line_item_columns"

# room + description are the merge identity of an item and can never be
# disabled or made optional (locked=True).
DEFAULT_LINE_ITEM_COLUMNS: list[dict[str, Any]] = [
    {
        "key": "room",
        "label": "Room",
        "type": "text",
        "required": True,
        "builtin": True,
        "enabled": True,
        "locked": True,
    },
    {
        "key": "description",
        "label": "Description",
        "type": "text",
        "required": True,
        "builtin": True,
        "enabled": True,
        "locked": True,
    },
    {
        "key": "unit",
        "label": "Unit",
        "type": "text",
        "required": True,
        "builtin": True,
        "enabled": True,
        "locked": False,
    },
    {
        "key": "raw_dimension",
        "label": "Dimension",
        "type": "text",
        "required": False,
        "builtin": True,
        "enabled": True,
        "locked": False,
    },
    {
        "key": "qty",
        "label": "Qty",
        "type": "number",
        "required": False,
        "builtin": True,
        "enabled": True,
        "locked": False,
    },
    {
        "key": "rate",
        "label": "Rate (₹)",
        "type": "number",
        "required": False,
        "builtin": True,
        "enabled": True,
        "locked": False,
    },
    {
        "key": "est_time",
        "label": "Est. Time",
        "type": "text",
        "required": False,
        "builtin": True,
        "enabled": True,
        "locked": False,
    },
    {
        "key": "remarks",
        "label": "Remarks",
        "type": "text",
        "required": False,
        "builtin": True,
        "enabled": True,
        "locked": False,
    },
]

BUILTIN_COLUMN_KEYS = tuple(c["key"] for c in DEFAULT_LINE_ITEM_COLUMNS)

# Custom column keys must not collide with any line-item attribute.
RESERVED_COLUMN_KEYS = BUILTIN_COLUMN_KEYS + (
    "id",
    "quotation_id",
    "position",
    "catalog_type",
    "initial_price",
    "negotiated_price",
    "status",
    "source_checkpoint_id",
    "extra",
    "verified",
    "created_at",
    "updated_at",
)


def get_line_item_columns(db: Session) -> list[dict[str, Any]]:
    """Current column definitions, falling back to the defaults."""
    row = db.get(AppSetting, LINE_ITEM_COLUMNS_KEY)
    if row and isinstance(row.value, dict):
        columns = row.value.get("columns")
        if isinstance(columns, list) and columns:
            return columns
    return DEFAULT_LINE_ITEM_COLUMNS


def missing_required_problems(
    items: list[Any], columns: list[dict[str, Any]]
) -> list[str]:
    """Human-readable problems for items missing mandatory columns.

    Builtin columns are read as attributes, custom columns from the
    item's `extra` mapping. Disabled columns are never enforced.
    """
    required = [
        c for c in columns if c.get("required") and c.get("enabled", True)
    ]
    problems: list[str] = []
    for i, item in enumerate(items, start=1):
        missing: list[str] = []
        for col in required:
            if col.get("builtin"):
                value = getattr(item, col["key"], None)
            else:
                value = (getattr(item, "extra", None) or {}).get(col["key"])
            if value is None or (isinstance(value, str) and not value.strip()):
                missing.append(col["label"])
        if missing:
            room = getattr(item, "room", "") or ""
            description = getattr(item, "description", "") or ""
            label = (
                " — ".join(p for p in (room, description) if p.strip())
                or f"row {i}"
            )
            problems.append(f"{label}: missing {', '.join(missing)}")
    return problems
