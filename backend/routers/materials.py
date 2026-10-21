import base64
import io
import time
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core import get_db
from ..models.margin import MarginConfig
from ..models.material import MaterialRate
from ..models.user import User
from ..schemas.material import (
    MarginConfigRead,
    MarginConfigUpdate,
    MaterialBulkPreview,
    MaterialBulkRow,
    MaterialCreate,
    MaterialRead,
    MaterialUpdate,
)
from ..services.ai_access import (
    OP_MATERIALS_EXTRACT,
    log_ai_usage,
    resolve_openai_access,
)
from ..services.ai_models import ModelTier
from .deps import get_current_user, require_admin

router = APIRouter()


@router.get("/materials", response_model=list[MaterialRead])
def list_materials(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.execute(
            select(MaterialRate).order_by(
                MaterialRate.category, MaterialRate.name
            )
        )
        .scalars()
        .all()
    )


@router.post("/materials", response_model=MaterialRead, status_code=201)
def create_material(
    body: MaterialCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    material = MaterialRate(**body.model_dump())
    db.add(material)
    db.commit()
    db.refresh(material)
    return material


@router.put("/materials/{material_id}", response_model=MaterialRead)
def update_material(
    material_id: str,
    body: MaterialUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    material = (
        db.execute(
            select(MaterialRate).where(
                MaterialRate.id == uuid.UUID(material_id)
            )
        )
        .scalars()
        .first()
    )
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(material, field, value)
    db.commit()
    db.refresh(material)
    return material


@router.delete("/materials/{material_id}", status_code=204)
def delete_material(
    material_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    material = (
        db.execute(
            select(MaterialRate).where(
                MaterialRate.id == uuid.UUID(material_id)
            )
        )
        .scalars()
        .first()
    )
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    db.delete(material)
    db.commit()


@router.post("/materials/bulk-preview", response_model=MaterialBulkPreview)
async def bulk_preview(
    file: UploadFile = File(...),
    _admin: User = Depends(require_admin),
):
    """Parse an Excel file and return rows for preview without saving."""
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not installed")

    content = await file.read()
    try:
        wb = openpyxl.load_workbook(
            io.BytesIO(content), read_only=True, data_only=True
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Excel file")

    ws = wb.active
    rows: list[MaterialBulkRow] = []
    errors: list[str] = []

    header_skipped = False
    for i, row in enumerate(ws.iter_rows(values_only=True), start=1):
        if not header_skipped:
            header_skipped = True
            continue
        if not any(row):
            continue
        name, category, unit, unit_cost, *_ = [*row, None, None, None, None]
        try:
            rows.append(
                MaterialBulkRow(
                    name=str(name or "").strip(),
                    category=str(category or "").strip(),
                    unit=str(unit or "sqft").strip(),
                    unit_cost=float(unit_cost or 0),
                )
            )
        except Exception as exc:
            errors.append(f"Row {i}: {exc}")

    return MaterialBulkPreview(rows=rows, errors=errors)


@router.post(
    "/materials/bulk-confirm",
    response_model=list[MaterialRead],
    status_code=201,
)
def bulk_confirm(
    body: MaterialBulkPreview,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Save previewed rows to the database."""
    created = []
    for row in body.rows:
        m = MaterialRate(**row.model_dump())
        db.add(m)
        created.append(m)
    db.commit()
    for m in created:
        db.refresh(m)
    return created


@router.post("/materials/ai-extract", response_model=MaterialBulkPreview)
async def ai_extract(
    file: UploadFile = File(...),
    tier: ModelTier | None = Form(default=None),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Extract a materials table from an image with the chosen tier's model."""
    access = resolve_openai_access(_admin, tier)
    api_key = access.api_key

    content = await file.read()
    b64 = base64.b64encode(content).decode()
    mime = file.content_type or "image/jpeg"

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        t0 = time.monotonic()
        response = client.chat.completions.create(
            model=access.model,
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Extract all materials/rates from this image. "
                                "Return ONLY a JSON array of objects with keys: "
                                "name, category, unit, unit_cost (number). "
                                "If a field is missing use empty string or 0. "
                                "No markdown, no explanation — raw JSON array only."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{b64}"},
                        },
                    ],
                }
            ],
        )
    except Exception as exc:
        log_ai_usage(
            db,
            operation=OP_MATERIALS_EXTRACT,
            model=access.model,
            latency_ms=int((time.monotonic() - t0) * 1000),
            status="error",
        )
        raise HTTPException(status_code=502, detail=f"OpenAI error: {exc}")

    usage = response.usage
    log_ai_usage(
        db,
        operation=OP_MATERIALS_EXTRACT,
        model=access.model,
        latency_ms=int((time.monotonic() - t0) * 1000),
        status="success",
        input_tokens=usage.prompt_tokens if usage else None,
        output_tokens=usage.completion_tokens if usage else None,
    )

    import json

    raw = response.choices[0].message.content or "[]"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502, detail="AI returned non-JSON response"
        )

    rows: list[MaterialBulkRow] = []
    errors: list[str] = []
    for i, item in enumerate(data, start=1):
        try:
            rows.append(MaterialBulkRow(**item))
        except Exception as exc:
            errors.append(f"Item {i}: {exc}")

    return MaterialBulkPreview(rows=rows, errors=errors)


@router.get("/margins", response_model=list[MarginConfigRead])
def list_margins(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.execute(select(MarginConfig)).scalars().all()


@router.put("/margins", response_model=MarginConfigRead)
def upsert_margin(
    body: MarginConfigUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    existing = (
        db.execute(
            select(MarginConfig).where(MarginConfig.category == body.category)
        )
        .scalars()
        .first()
    )
    if existing:
        existing.margin_percent = body.margin_percent
        db.commit()
        db.refresh(existing)
        return existing
    margin = MarginConfig(
        category=body.category, margin_percent=body.margin_percent
    )
    db.add(margin)
    db.commit()
    db.refresh(margin)
    return margin
