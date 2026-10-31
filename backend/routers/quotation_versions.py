"""Quotation versions: designer-managed (authenticated) and public view."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
)
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, defer, selectinload

from ..core import get_db
from ..models.business import Business
from ..models.client import Client
from ..models.design import Design, DesignHotspot
from ..models.quotation import Quotation
from ..models.quotation_message import QuotationMessage
from ..models.quotation_version import QuotationShare, QuotationVersion
from ..models.user import User
from ..schemas.quotation import QuotationLineItemRead
from ..schemas.quotation_version import (
    QuotationMessageRead,
    QuotationMessageResolve,
    QuotationShareCreate,
    QuotationShareRead,
    QuotationShareResponse,
    QuotationShareUpdate,
    QuotationVersionActiveUpdate,
    QuotationVersionCreate,
    QuotationVersionDesignsUpdate,
    QuotationVersionRead,
    QuotationVersionRestoreResult,
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
    live_shares,
    restore_version,
    shared_rooms,
    take_over_share,
    to_summary,
    validate_room_designs,
)
from ..services.quotation_version_xlsx import (
    ImportFileError,
    parse_version_xlsx,
)
from .deps import get_current_user
from .designs import design_image_url, design_thumb_url
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
        view_count=share.view_count,
        last_viewed_at=share.last_viewed_at,
        response_kind=share.response_kind,
        response_name=share.response_name,
        response_message=share.response_message,
        responded_at=share.responded_at,
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
_RESPONSE_COOLDOWN_SECONDS = 60


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
    # The frozen line items can be large; the list only needs their count.
    rows = db.execute(
        select(
            QuotationVersion,
            func.jsonb_array_length(QuotationVersion.line_items),
        )
        .options(defer(QuotationVersion.line_items))
        .where(QuotationVersion.quotation_id == quotation.id)
        .order_by(QuotationVersion.number.desc())
    ).all()
    shares = live_shares(db, quotation.id)
    return [to_summary(v, shares.get(v.id), count) for v, count in rows]


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


@router.post(
    "/quotation-versions/{version_id}/restore",
    response_model=QuotationVersionRestoreResult,
)
def restore_quotation_version(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace the live quotation with this version's items.

    The state being replaced is saved as a new version first.
    """
    version = _version_or_404(version_id, db, current_user)
    backup, restored = restore_version(db, version, current_user.id)
    db.commit()
    if backup:
        db.refresh(backup)
    return QuotationVersionRestoreResult(
        restored_number=version.number,
        items_restored=restored,
        backup=to_summary(backup) if backup else None,
    )


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
    # One version is shared: an existing link moves here, URL unchanged.
    share = take_over_share(db, version)
    if share is None:
        client = db.scalars(
            select(Client)
            .join(Quotation, Quotation.client_id == Client.id)
            .where(Quotation.id == version.quotation_id)
        ).first()
        share = QuotationShare(
            version_id=version.id,
            token=share_links.readable_token(client.name if client else ""),
            created_by_id=current_user.id,
            created_at=share_links.now(),
        )
        db.add(share)
    share.show_prices = body.show_prices
    share.expires_at = body.expires_at
    db.commit()
    db.refresh(share)
    return _share_to_read(share)


@router.patch(
    "/quotation-versions/{version_id}/shares/{share_id}",
    response_model=QuotationShareRead,
)
def update_version_share(
    version_id: str,
    share_id: str,
    body: QuotationShareUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Extend or renew a link in place so the URL the customer has still works."""
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
    share_links.validate_future_expiry(body.expires_at)
    share.expires_at = body.expires_at
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
    # One joined query for the whole chain instead of five round trips.
    row = db.execute(
        select(QuotationShare, QuotationVersion, Client, Business)
        .join(
            QuotationVersion, QuotationVersion.id == QuotationShare.version_id
        )
        .join(Quotation, Quotation.id == QuotationVersion.quotation_id)
        .join(Client, Client.id == Quotation.client_id)
        .outerjoin(Business, Business.id == Client.business_id)
        .where(QuotationShare.token == token)
    ).first()
    if not row:
        raise unavailable
    share, version, client, business = row
    if (
        share.revoked_at is not None
        or share_links.is_expired(share.expires_at)
        or not version.is_active
        or not client.is_active
    ):
        raise unavailable

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
                thumb_url=design_thumb_url(d),
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
    view = SharedQuotationView(
        business_name=business.name if business else None,
        contact_email=business.contact_email if business else None,
        contact_phone=business.contact_phone if business else None,
        responded_kind=share.response_kind,
        project_name=client.name,
        version_number=version.number,
        label=version.label,
        created_at=version.created_at,
        show_prices=share.show_prices,
        is_agreed=version.is_agreed,
        rooms=rooms,
        total=total,
    )
    # Atomic increment: concurrent viewers no longer overwrite each other.
    db.execute(
        update(QuotationShare)
        .where(QuotationShare.id == share.id)
        .values(
            view_count=func.coalesce(QuotationShare.view_count, 0) + 1,
            last_viewed_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    return view


@public_router.post(
    "/quotation-share/{token}/respond",
    status_code=204,
    response_class=Response,
)
def respond_to_shared_quotation(
    token: str,
    body: QuotationShareResponse,
    db: Session = Depends(get_db),
):
    """The customer approves the quotation or asks a question (public)."""
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
        raise HTTPException(status_code=404, detail="Link not available")
    # One answer per link per minute: bounds spam without extra infrastructure.
    if share.responded_at and (
        datetime.now(timezone.utc) - share.responded_at
    ) < timedelta(seconds=_RESPONSE_COOLDOWN_SECONDS):
        raise HTTPException(
            status_code=429, detail="Please wait a moment before sending again"
        )
    version = db.get(QuotationVersion, share.version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Link not available")
    now = datetime.now(timezone.utc)
    name = body.name.strip()
    text = (body.message or "").strip() or None
    share.response_kind = body.kind
    share.response_name = name
    share.response_message = text
    share.responded_at = now
    # The link keeps only the latest answer; the message list keeps them all.
    db.add(
        QuotationMessage(
            quotation_id=version.quotation_id,
            version_id=version.id,
            version_number=version.number,
            kind=body.kind,
            name=name,
            message=text,
            created_at=now,
        )
    )
    db.commit()
    return Response(status_code=204)


def _message_to_read(
    message: QuotationMessage, resolver: str | None
) -> QuotationMessageRead:
    return QuotationMessageRead(
        id=message.id,
        version_id=message.version_id,
        version_number=message.version_number,
        kind=message.kind,
        name=message.name,
        message=message.message,
        created_at=message.created_at,
        resolved_at=message.resolved_at,
        resolved_by_name=resolver,
    )


@router.get(
    "/clients/{client_id}/quotation/messages",
    response_model=list[QuotationMessageRead],
)
def list_quotation_messages(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Everything customers sent from shared links, open questions first."""
    get_client_or_404(client_id, db, current_user)
    quotation = _latest_quotation(client_id, db)
    if not quotation:
        return []
    rows = db.execute(
        select(QuotationMessage, User.full_name)
        .outerjoin(User, User.id == QuotationMessage.resolved_by_id)
        .where(QuotationMessage.quotation_id == quotation.id)
        .order_by(QuotationMessage.created_at.desc())
    ).all()
    messages = [_message_to_read(m, who) for m, who in rows]
    # Open questions lead; within each group the newest comes first.
    messages.sort(
        key=lambda m: not (m.kind == "question" and m.resolved_at is None)
    )
    return messages


@router.patch(
    "/quotation-messages/{message_id}", response_model=QuotationMessageRead
)
def resolve_quotation_message(
    message_id: str,
    body: QuotationMessageResolve,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a customer's question answered, or open it again."""
    q = (
        select(QuotationMessage)
        .join(Quotation, Quotation.id == QuotationMessage.quotation_id)
        .join(Client, Client.id == Quotation.client_id)
        .where(QuotationMessage.id == uuid.UUID(message_id))
    )
    message = (
        db.execute(restrict_to_accessible(q, current_user)).scalars().first()
    )
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    message.resolved_at = datetime.now(timezone.utc) if body.resolved else None
    message.resolved_by_id = current_user.id if body.resolved else None
    db.commit()
    return _message_to_read(
        message, current_user.full_name if body.resolved else None
    )
