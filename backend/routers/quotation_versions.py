"""Quotation versions: designer-managed (authenticated) and public view."""

import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
)
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..core import get_db
from ..models.business import Business
from ..models.client import Client
from ..models.design import Design, DesignHotspot
from ..models.quotation import Quotation
from ..models.quotation_version import QuotationShare, QuotationVersion
from ..models.user import User
from ..schemas.quotation import QuotationLineItemRead
from ..schemas.quotation_version import (
    QuotationShareCreate,
    QuotationShareRead,
    QuotationVersionActiveUpdate,
    QuotationVersionCreate,
    QuotationVersionDesignsUpdate,
    QuotationVersionRead,
    QuotationVersionSummary,
    SharedQuotationView,
)
from ..schemas.share import SharedDesign
from ..services import share_links
from ..services.client_access import get_client_or_404, restrict_to_accessible
from ..services.quotation_version import (
    AttachmentError,
    EmptyQuotationError,
    agree_version,
    create_version,
    create_version_from_rows,
    shared_rooms,
    to_summary,
    validate_room_designs,
)
from ..services.quotation_version_xlsx import (
    ImportFileError,
    parse_version_xlsx,
)
from .deps import get_current_user
from .designs import design_image_url
from .quotations import _latest_quotation
from .share import _shared_hotspot

router = APIRouter()
public_router = APIRouter()


def _version_or_404(
    version_id: str, db: Session, current_user: User
) -> QuotationVersion:
    q = (
        select(QuotationVersion)
        .join(Quotation, Quotation.id == QuotationVersion.quotation_id)
        .join(Client, Client.id == Quotation.client_id)
        .where(QuotationVersion.id == uuid.UUID(version_id))
    )
    q = restrict_to_accessible(q, current_user)
    version = db.execute(q).scalars().first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


def _share_to_read(share: QuotationShare) -> QuotationShareRead:
    return QuotationShareRead(
        id=share.id,
        version_id=share.version_id,
        url=share_links.public_url("quotation", share.token),
        show_prices=share.show_prices,
        expires_at=share.expires_at,
        revoked_at=share.revoked_at,
        created_at=share.created_at,
    )


@router.post(
    "/clients/{client_id}/quotation/versions",
    response_model=QuotationVersionSummary,
    status_code=201,
)
def save_version(
    client_id: str,
    body: QuotationVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Freeze the current quotation as the next numbered version."""
    get_client_or_404(client_id, db, current_user)
    quotation = _latest_quotation(client_id, db)
    if not quotation:
        raise HTTPException(status_code=404, detail="No quotation found")
    try:
        version = create_version(
            db, quotation, current_user.id, body.label, body.room_designs
        )
    except EmptyQuotationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except AttachmentError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=str(exc)
        ) from exc
    db.commit()
    db.refresh(version)
    return to_summary(version)


_MAX_IMPORT_BYTES = 5 * 1024 * 1024


@router.post(
    "/clients/{client_id}/quotation/versions/import",
    response_model=QuotationVersionSummary,
    status_code=201,
)
async def import_version(
    client_id: str,
    file: UploadFile = File(...),
    label: str | None = Form(default=None, max_length=120),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save an edited Excel export as a new version; live quotation unchanged."""
    get_client_or_404(client_id, db, current_user)
    quotation = _latest_quotation(client_id, db)
    if not quotation:
        raise HTTPException(status_code=404, detail="No quotation found")
    data = await file.read(_MAX_IMPORT_BYTES + 1)
    if len(data) > _MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 5 MB")
    try:
        version = create_version_from_rows(
            db,
            quotation,
            current_user.id,
            label,
            parse_version_xlsx(data),
        )
    except (ImportFileError, EmptyQuotationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.commit()
    db.refresh(version)
    return to_summary(version)


@router.get(
    "/clients/{client_id}/quotation/versions",
    response_model=list[QuotationVersionSummary],
)
def list_versions(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_client_or_404(client_id, db, current_user)
    quotation = _latest_quotation(client_id, db)
    if not quotation:
        return []
    versions = (
        db.execute(
            select(QuotationVersion)
            .where(QuotationVersion.quotation_id == quotation.id)
            .order_by(QuotationVersion.number.desc())
        )
        .scalars()
        .all()
    )
    return [to_summary(v) for v in versions]


@router.get(
    "/quotation-versions/{version_id}", response_model=QuotationVersionRead
)
def get_version(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = _version_or_404(version_id, db, current_user)
    return QuotationVersionRead(
        **to_summary(version).model_dump(),
        line_items=[
            QuotationLineItemRead.model_validate(i) for i in version.line_items
        ],
    )


@router.put(
    "/quotation-versions/{version_id}/designs",
    response_model=QuotationVersionSummary,
)
def set_version_designs(
    version_id: str,
    body: QuotationVersionDesignsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change which design images appear with which room of a version."""
    version = _version_or_404(version_id, db, current_user)
    client_id = db.scalar(
        select(Quotation.client_id).where(Quotation.id == version.quotation_id)
    )
    try:
        version.room_designs = validate_room_designs(
            db,
            client_id,
            {i["room"] for i in version.line_items},
            body.room_designs,
        )
    except AttachmentError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=str(exc)
        ) from exc
    db.commit()
    db.refresh(version)
    return to_summary(version)


@router.patch(
    "/quotation-versions/{version_id}/active",
    response_model=QuotationVersionSummary,
)
def set_version_active(
    version_id: str,
    body: QuotationVersionActiveUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deactivate a version (its share links stop working) or restore it."""
    version = _version_or_404(version_id, db, current_user)
    if version.is_agreed and not body.is_active:
        raise HTTPException(
            status_code=409,
            detail="Remove the client pick before deactivating this version",
        )
    version.is_active = body.is_active
    db.commit()
    db.refresh(version)
    return to_summary(version)


@router.put(
    "/quotation-versions/{version_id}/agree",
    response_model=QuotationVersionSummary,
)
def agree_quotation_version(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Client pick: the designer and client settled on this version."""
    version = _version_or_404(version_id, db, current_user)
    if not version.is_active:
        raise HTTPException(
            status_code=409, detail="Activate this version to pick it"
        )
    agree_version(db, version, current_user.id)
    db.commit()
    db.refresh(version)
    return to_summary(version)


@router.delete(
    "/quotation-versions/{version_id}/agree",
    response_model=QuotationVersionSummary,
)
def unagree_quotation_version(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Undo a client pick. The project phase is left as it is."""
    version = _version_or_404(version_id, db, current_user)
    version.is_agreed = False
    version.agreed_at = None
    version.agreed_by_id = None
    db.commit()
    db.refresh(version)
    return to_summary(version)


@router.get(
    "/quotation-versions/{version_id}/shares",
    response_model=list[QuotationShareRead],
)
def list_version_shares(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = _version_or_404(version_id, db, current_user)
    shares = (
        db.execute(
            select(QuotationShare)
            .where(QuotationShare.version_id == version.id)
            .where(QuotationShare.revoked_at.is_(None))
            .order_by(QuotationShare.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [_share_to_read(s) for s in shares]


@router.post(
    "/quotation-versions/{version_id}/shares",
    response_model=QuotationShareRead,
    status_code=201,
)
def create_version_share(
    version_id: str,
    body: QuotationShareCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Public link to one version; the designer decides if prices show."""
    version = _version_or_404(version_id, db, current_user)
    if not version.is_active:
        raise HTTPException(
            status_code=409, detail="Activate this version to share it"
        )
    share_links.validate_future_expiry(body.expires_at)
    share = QuotationShare(
        version_id=version.id,
        token=share_links.new_token(),
        show_prices=body.show_prices,
        expires_at=body.expires_at,
        created_by_id=current_user.id,
        created_at=share_links.now(),
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return _share_to_read(share)


@router.delete(
    "/quotation-versions/{version_id}/shares/{share_id}", status_code=204
)
def revoke_version_share(
    version_id: str,
    share_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = _version_or_404(version_id, db, current_user)
    share = (
        db.execute(
            select(QuotationShare)
            .where(QuotationShare.id == uuid.UUID(share_id))
            .where(QuotationShare.version_id == version.id)
        )
        .scalars()
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")
    # Stopped links are deleted outright; nothing is kept.
    db.delete(share)
    db.commit()
    return Response(status_code=204)


@public_router.get(
    "/quotation-share/{token}", response_model=SharedQuotationView
)
def view_shared_quotation(token: str, db: Session = Depends(get_db)):
    """Public, read-only view. Unknown, revoked and expired are all 404."""
    unavailable = HTTPException(status_code=404, detail="Link not available")
    share = (
        db.execute(select(QuotationShare).where(QuotationShare.token == token))
        .scalars()
        .first()
    )
    if (
        not share
        or share.revoked_at is not None
        or share_links.is_expired(share.expires_at)
    ):
        raise unavailable

    version = db.get(QuotationVersion, share.version_id)
    if not version or not version.is_active:
        raise unavailable
    quotation = db.get(Quotation, version.quotation_id)
    client = db.get(Client, quotation.client_id) if quotation else None
    if not client or not client.is_active:
        raise unavailable
    business = (
        db.get(Business, client.business_id) if client.business_id else None
    )

    rooms, total = shared_rooms(version, share.show_prices)
    wanted = {d for ids in version.room_designs.values() for d in ids}
    designs = {
        str(d.id): d
        for d in db.execute(
            select(Design)
            .options(
                selectinload(Design.hotspots).selectinload(
                    DesignHotspot.material
                )
            )
            .where(Design.client_id == client.id)
            .where(Design.id.in_([uuid.UUID(d) for d in wanted]))
        )
        .scalars()
        .all()
    }
    for group in rooms:
        group.designs = [
            SharedDesign(
                id=d.id,
                title=d.title,
                description=d.description,
                image_url=design_image_url(d),
                hotspots=[
                    _shared_hotspot(h, share.show_prices) for h in d.hotspots
                ],
            )
            for d in (
                designs.get(i)
                for i in version.room_designs.get(group.room, [])
            )
            if d is not None
        ]
    return SharedQuotationView(
        business_name=business.name if business else None,
        project_name=client.name,
        version_number=version.number,
        label=version.label,
        created_at=version.created_at,
        show_prices=share.show_prices,
        is_agreed=version.is_agreed,
        rooms=rooms,
        total=total,
    )
