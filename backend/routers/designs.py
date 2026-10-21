import uuid
from datetime import datetime

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
)
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from ..core import get_db
from ..core.logging import logger
from ..models.audit import AuditLog
from ..models.business import Business
from ..models.client import Client, ProjectPhase
from ..models.design import Design, DesignHotspot, DesignSource
from ..models.material import MaterialRate
from ..models.user import User
from ..schemas.design import (
    DesignCreate,
    DesignPortfolioUpdate,
    DesignRead,
    DesignRoomsUpdate,
    HotspotCreate,
    HotspotQuotationAdd,
    HotspotRead,
    HotspotUpdate,
    PortfolioDesignRead,
)
from ..services.client_access import get_client_or_404, restrict_to_accessible
from ..services.design_quotation import (
    HotspotQuotationError,
    add_hotspot_to_quotation,
)
from ..services.image_quota import (
    MB,
    effective_max_bytes,
    ensure_can_upload,
)
from ..services.storage import (
    CONTENT_TYPES,
    StorageError,
    get_storage,
    signed_media_url,
    sniff_image_ext,
)
from .deps import get_current_user

router = APIRouter()

_DESIGN_LOAD = selectinload(Design.hotspots).selectinload(
    DesignHotspot.material
)


def design_image_url(design: Design) -> str | None:
    """Signed URL for an uploaded image, else the legacy external URL."""
    if design.storage_path:
        return signed_media_url(design.storage_path)
    return design.image_url


def design_to_read(design: Design) -> DesignRead:
    read = DesignRead.model_validate(design)
    return read.model_copy(update={"image_url": design_image_url(design)})


def _design_or_404(client_id: str, design_id: str, db: Session) -> Design:
    design = (
        db.execute(
            select(Design)
            .options(_DESIGN_LOAD)
            .where(Design.id == uuid.UUID(design_id))
            .where(Design.client_id == uuid.UUID(client_id))
            # Hotspot links are cleared by the DB when a line is deleted.
            .execution_options(populate_existing=True)
        )
        .scalars()
        .first()
    )
    if not design:
        raise HTTPException(status_code=404, detail="Design not found")
    return design


def _check_material(db: Session, material_id: uuid.UUID | None) -> None:
    """Reject a material outside the caller's business (RLS hides it)."""
    if material_id is None:
        return
    found = db.execute(
        select(MaterialRate.id).where(MaterialRate.id == material_id)
    ).first()
    if not found:
        raise HTTPException(status_code=404, detail="Material not found")


@router.get("/portfolio-designs", response_model=list[PortfolioDesignRead])
def list_portfolio_designs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Designs the caller has added to the portfolio, across clients."""
    q = (
        select(Design, Client.name)
        .join(Client, Client.id == Design.client_id)
        .options(_DESIGN_LOAD)
        .where(Client.is_active.is_(True))
        .where(Design.in_portfolio.is_(True))
        .order_by(Design.created_at.desc())
    )
    q = restrict_to_accessible(q, current_user)
    rows = db.execute(q).all()
    return [
        PortfolioDesignRead(
            **design_to_read(design).model_dump(), client_name=client_name
        )
        for design, client_name in rows
    ]


@router.get("/clients/{client_id}/designs", response_model=list[DesignRead])
def list_designs(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)
    designs = (
        db.execute(
            select(Design)
            .options(_DESIGN_LOAD)
            .where(Design.client_id == uuid.UUID(client_id))
            .order_by(Design.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [design_to_read(d) for d in designs]


@router.post(
    "/clients/{client_id}/designs", response_model=DesignRead, status_code=201
)
def upload_design(
    client_id: str,
    body: DesignCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)
    design = Design(
        client_id=uuid.UUID(client_id),
        source=body.source,
        title=body.title,
        image_url=body.image_url,
        specs_json=body.specs_json,
        description=body.description,
    )
    db.add(design)
    db.commit()
    db.refresh(design)
    return design_to_read(design)


@router.post(
    "/clients/{client_id}/designs/upload",
    response_model=DesignRead,
    status_code=201,
)
def upload_design_image(
    client_id: str,
    file: UploadFile = File(...),
    title: str | None = Form(default=None, max_length=255),
    description: str | None = Form(default=None, max_length=2000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Store an image file (JPEG/PNG/WebP) as a designer-uploaded design."""
    client = get_client_or_404(client_id, db, current_user)
    business = (
        db.get(Business, client.business_id) if client.business_id else None
    )
    ensure_can_upload(business, db)

    limit = effective_max_bytes(business)
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"Image must be {limit // MB} MB or smaller",
        )
    ext = sniff_image_ext(data)
    if ext is None:
        raise HTTPException(
            status_code=415, detail="Only JPEG, PNG or WebP images"
        )

    design_id = uuid.uuid4()
    path = f"designs/{client_id}/{design_id}.{ext}"
    try:
        get_storage().put(path, data, CONTENT_TYPES[ext])
    except StorageError:
        logger.exception("design_image_store_failed", client_id=client_id)
        raise HTTPException(status_code=502, detail="Could not store image")

    design = Design(
        id=design_id,
        client_id=uuid.UUID(client_id),
        source=DesignSource.designer_uploaded,
        title=title or (file.filename or None),
        storage_path=path,
        description=description,
        specs_json={},
    )
    db.add(design)
    db.commit()
    db.refresh(design)
    return design_to_read(design)


@router.delete("/clients/{client_id}/designs/{design_id}", status_code=204)
def delete_design(
    client_id: str,
    design_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)
    design = _design_or_404(client_id, design_id, db)
    path = design.storage_path
    db.delete(design)
    db.commit()
    if path:
        try:
            get_storage().delete(path)
        except StorageError:
            # The row is gone; an orphaned object is only wasted space.
            logger.warning("design_image_delete_failed", path=path)
    return Response(status_code=204)


@router.post(
    "/clients/{client_id}/designs/{design_id}/select",
    response_model=DesignRead,
)
def select_design(
    client_id: str,
    design_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = get_client_or_404(client_id, db, current_user)

    # Deselect all designs for this client
    db.execute(
        update(Design)
        .where(Design.client_id == uuid.UUID(client_id))
        .values(is_selected=False)
    )

    design = _design_or_404(client_id, design_id, db)

    design.is_selected = True

    # Auto-advance to quotation phase
    if client.current_phase == ProjectPhase.design:
        client.current_phase = ProjectPhase.quotation

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="design_selected",
            entity_type="design",
            entity_id=design_id,
            payload={"client_id": client_id},
            timestamp=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(design)
    return design_to_read(design)


@router.put(
    "/clients/{client_id}/designs/{design_id}/portfolio",
    response_model=DesignRead,
)
def set_design_portfolio(
    client_id: str,
    design_id: str,
    body: DesignPortfolioUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Opt a design in or out of the business's public portfolio."""
    get_client_or_404(client_id, db, current_user)
    design = _design_or_404(client_id, design_id, db)
    design.in_portfolio = body.in_portfolio
    db.commit()
    db.refresh(design)
    return design_to_read(design)


@router.put(
    "/clients/{client_id}/designs/{design_id}/rooms",
    response_model=DesignRead,
)
def set_design_rooms(
    client_id: str,
    design_id: str,
    body: DesignRoomsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tag the quotation rooms this image belongs to."""
    get_client_or_404(client_id, db, current_user)
    design = _design_or_404(client_id, design_id, db)
    design.rooms = list(dict.fromkeys(body.rooms))
    db.commit()
    db.refresh(design)
    return design_to_read(design)


@router.post(
    "/clients/{client_id}/designs/{design_id}/hotspots",
    response_model=HotspotRead,
    status_code=201,
)
def create_hotspot(
    client_id: str,
    design_id: str,
    body: HotspotCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)
    design = _design_or_404(client_id, design_id, db)
    _check_material(db, body.material_id)
    hotspot = DesignHotspot(design=design, **body.model_dump())
    db.add(hotspot)
    db.commit()
    db.refresh(hotspot)
    return hotspot


def _hotspot_or_404(design: Design, hotspot_id: str) -> DesignHotspot:
    hotspot = next(
        (h for h in design.hotspots if str(h.id) == hotspot_id), None
    )
    if not hotspot:
        raise HTTPException(status_code=404, detail="Hotspot not found")
    return hotspot


@router.post(
    "/clients/{client_id}/designs/{design_id}/hotspots/{hotspot_id}"
    "/add-to-quotation",
    response_model=HotspotRead,
    status_code=201,
)
def add_hotspot_to_quotation_route(
    client_id: str,
    design_id: str,
    hotspot_id: str,
    body: HotspotQuotationAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add the hotspot as a quotation line, creating the quotation if needed."""
    get_client_or_404(client_id, db, current_user)
    design = _design_or_404(client_id, design_id, db)
    hotspot = _hotspot_or_404(design, hotspot_id)
    try:
        add_hotspot_to_quotation(
            db, uuid.UUID(client_id), hotspot, body, current_user.id
        )
    except HotspotQuotationError as exc:
        # Every check runs before the first write, so nothing to undo.
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    db.commit()
    db.refresh(hotspot)
    return hotspot


@router.put(
    "/clients/{client_id}/designs/{design_id}/hotspots/{hotspot_id}",
    response_model=HotspotRead,
)
def update_hotspot(
    client_id: str,
    design_id: str,
    hotspot_id: str,
    body: HotspotUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)
    design = _design_or_404(client_id, design_id, db)
    hotspot = _hotspot_or_404(design, hotspot_id)
    _check_material(db, body.material_id)
    for field, value in body.model_dump().items():
        setattr(hotspot, field, value)
    db.commit()
    db.refresh(hotspot)
    return hotspot


@router.delete(
    "/clients/{client_id}/designs/{design_id}/hotspots/{hotspot_id}",
    status_code=204,
)
def delete_hotspot(
    client_id: str,
    design_id: str,
    hotspot_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)
    design = _design_or_404(client_id, design_id, db)
    db.delete(_hotspot_or_404(design, hotspot_id))
    db.commit()
    return Response(status_code=204)
