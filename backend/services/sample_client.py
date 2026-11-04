"""The demo client offered to new users so the app is not empty on day one.

It carries one of everything a real client has (contact details, notes, two
designs, two quotation versions, shared links, customer messages) so a
designer can explore every screen, then delete it in one go.
"""

import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.logging import logger
from ..models.checkpoint import Checkpoint, CheckpointSource, CheckpointStatus
from ..models.client import Client, ProjectPhase
from ..models.design import Design, DesignHotspot, DesignSource
from ..models.quotation import Quotation, QuotationStatus
from ..models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from ..models.quotation_message import QuotationMessage
from ..models.quotation_version import QuotationShare
from ..models.share_link import ShareLink
from ..models.user import User
from . import share_links
from .quotation_service import resolve_line_item
from .quotation_version import create_version
from .storage import (
    CONTENT_TYPES,
    StorageError,
    get_storage,
    make_thumbnail,
    make_view_image,
    thumb_path,
    view_path,
)

# Real room photos live in the storage bucket under this prefix (uploaded once
# with `python -m backend.upload_sample_images`) and are copied per sample.
SAMPLE_PREFIX = "samples"
SECTIONAL_PHOTO = "living_room_sectional.jpg"
GARDEN_PHOTO = "living_room_garden.jpg"
# Storage name -> source file in the repo's data/ directory.
SAMPLE_PHOTO_SOURCES = {
    SECTIONAL_PHOTO: "photo-1616486338812-3dadae4b4ace.jpg",
    GARDEN_PHOTO: "photo-1618221195710-dd6b41faaea6.jpg",
}

SAMPLE_CLIENT_NAME = "Sample Client - Anita Rao"

_CONTACT = {
    "phone": "+91 90000 00000",
    "email": "anita.rao@example.com",
    "address": "Lakeview Residency, Flat 402, Bengaluru",
}

_NOTES = (
    "Sample data so you can explore every screen. 3BHK full interiors, "
    "warm wood and white palette, budget around 18 lakh. "
    "Delete this client any time."
)

_MEETING_NOTE = (
    "First site visit. Anita wants a modular kitchen with a breakfast "
    "counter, a wardrobe in the master bedroom, and a decor feature wall in the living "
    "room. Prefers warm wood laminate with white accents."
)

_TRANSCRIPT = (
    "Designer: How do you plan to use the living room?\n"
    "Anita: Mostly family evenings, so a calm feature wall with decor, and "
    "warm lighting. Maybe a false ceiling with cove lights.\n"
    "Designer: And the kitchen?\n"
    "Anita: L-shaped, granite counter, a breakfast counter if it fits.\n"
    "Designer: Bedroom?\n"
    "Anita: A full-height wardrobe on the left wall, 8 by 7 feet."
)

# Items the AI pulled from the call. Same keys the extractor produces.
_APPLIED_ITEMS: list[dict] = [
    {
        "room": "Living Room",
        "description": "Feature wall with decor paneling",
        "unit": "sqft",
        "raw_dimension": "10'x9'",
        "rate": 900,
        "remarks": "Sage paint, wooden shelves and frames",
    },
    {
        "room": "Living Room",
        "description": "False ceiling with cove lighting",
        "unit": "sqft",
        "raw_dimension": "12'x14'",
        "rate": 120,
        "remarks": "Gypsum, warm white LED cove",
    },
    {
        "room": "Kitchen",
        "description": "L-shaped modular kitchen",
        "unit": "sqft",
        "raw_dimension": "10'x8'",
        "rate": 2200,
        "remarks": "Granite counter, soft-close drawers",
    },
    {
        "room": "Master Bedroom",
        "description": "Full-height wardrobe",
        "unit": "sqft",
        "raw_dimension": "8'x7'",
        "rate": 1400,
        "remarks": "Laminate shutters, loft storage",
    },
]

# Waiting for the designer to review before they reach the quotation.
_PENDING_ITEMS: list[dict] = [
    {
        "room": "Kitchen",
        "description": "Breakfast counter",
        "unit": "nos",
        "qty": 1,
        "rate": 18000,
        "remarks": "Quartz top, two stools",
    },
    {
        "room": "Master Bedroom",
        "description": "Study nook",
        "unit": "sqft",
        "raw_dimension": "4'x2'",
        "rate": 1600,
        "remarks": "Wall-mounted desk with shelf",
    },
]

# (label, dimensions, labour cost, x, y, w, h) as fractions of the image.
_FEATURE_WALL = "Feature wall"
_LIVING_HOTSPOTS = (
    (_FEATURE_WALL, "10ft x 9ft", 6000, 0.12, 0.14, 0.34, 0.46),
    ("Cove ceiling", "12ft x 14ft", 4500, 0.0, 0.0, 1.0, 0.1),
    ("Curtains", "9ft x 6ft", 3500, 0.83, 0.03, 0.15, 0.78),
)


class SampleImageError(Exception):
    """The sample's images could not be written to storage."""


def find_sample_client(db: Session) -> Client | None:
    """The caller's sample client, if one is still there (RLS scopes the query)."""
    return (
        db.execute(
            select(Client).where(
                Client.is_sample.is_(True), Client.is_active.is_(True)
            )
        )
        .scalars()
        .first()
    )


def _store_image(
    client_id: uuid.UUID, filename: str, stored: list[str]
) -> tuple[uuid.UUID, str]:
    """Copy a sample photo from storage into this client, with its thumbnail and view copy."""
    storage = get_storage()
    try:
        data = storage.get(f"{SAMPLE_PREFIX}/{filename}")
    except (StorageError, httpx.HTTPError) as exc:
        raise SampleImageError(
            "Sample photos are missing from storage"
        ) from exc
    design_id = uuid.uuid4()
    path = f"designs/{client_id}/{design_id}.jpg"
    try:
        storage.put(path, data, CONTENT_TYPES["jpg"])
    except (StorageError, httpx.HTTPError) as exc:
        raise SampleImageError("Could not store sample images") from exc
    stored.append(path)
    for derived, build, kind in (
        (thumb_path(path), make_thumbnail, CONTENT_TYPES["jpg"]),
        (view_path(path), make_view_image, CONTENT_TYPES["webp"]),
    ):
        try:
            storage.put(derived, build(data), kind)
        except (StorageError, OSError, httpx.HTTPError):
            logger.warning("sample_derived_image_failed", path=derived)
    return design_id, path


def _line_item(
    quotation: Quotation,
    position: int,
    spec: dict,
    checkpoint: Checkpoint,
) -> QuotationLineItem:
    return resolve_line_item(
        QuotationLineItem(
            quotation_id=quotation.id,
            position=position,
            source_checkpoint_id=checkpoint.id,
            **spec,
        )
    )


def create_sample_client(db: Session, user: User) -> Client:
    """Create the sample client with everything attached; commits.

    If anything fails, the database work is rolled back and any image already
    uploaded is removed, so a remote bucket is never left with orphans.
    """
    stored: list[str] = []
    try:
        return _build_sample(db, user, stored)
    except BaseException:
        db.rollback()
        delete_stored_images(stored)
        raise


def _build_sample(db: Session, user: User, stored: list[str]) -> Client:
    now = datetime.now(timezone.utc)
    client = Client(
        name=SAMPLE_CLIENT_NAME,
        contact_info=_CONTACT,
        notes=_NOTES,
        current_phase=ProjectPhase.quotation,
        assigned_designer_id=user.id,
        is_sample=True,
    )
    db.add(client)
    db.flush()

    # Meeting notes: one typed by hand, one AI-extracted and already in the
    # quotation, one AI-extracted and waiting for review.
    manual = Checkpoint(
        client_id=client.id,
        summary_text=_MEETING_NOTE,
        status=CheckpointStatus.agreed,
        source=CheckpointSource.manual,
    )
    applied = Checkpoint(
        client_id=client.id,
        summary_text=(
            "Site call. Living room: feature wall and cove ceiling. Kitchen: "
            "L-shape with granite. Master bedroom: full-height wardrobe."
        ),
        raw_conversation=_TRANSCRIPT,
        structured_diff={
            "meeting_minutes": [
                "Living room gets a decor-paneled feature wall",
                "False ceiling with warm cove lighting",
                "L-shaped kitchen with granite counter",
                "Full-height wardrobe in the master bedroom",
            ],
            "line_items": _APPLIED_ITEMS,
        },
        status=CheckpointStatus.agreed,
        source=CheckpointSource.ai_extract,
        added_to_quotation=True,
        applied_at=now - timedelta(days=2),
        applied_by_id=user.id,
    )
    pending = Checkpoint(
        client_id=client.id,
        summary_text=(
            "Follow-up call. Anita wants a breakfast counter in the kitchen "
            "and a small study nook in the master bedroom."
        ),
        raw_conversation=(
            "Anita: Could we add a breakfast counter, and a study nook for "
            "the bedroom?\nDesigner: Yes, I will price both."
        ),
        structured_diff={
            "meeting_minutes": [
                "Add a breakfast counter in the kitchen",
                "Add a study nook in the master bedroom",
            ],
            "line_items": _PENDING_ITEMS,
        },
        status=CheckpointStatus.under_review,
        source=CheckpointSource.ai_extract,
    )
    db.add_all([manual, applied, pending])
    db.flush()

    # Two designs: the first is tagged with hotspots, the second is not.
    living_id, living_path = _store_image(client.id, SECTIONAL_PHOTO, stored)
    garden_id, garden_path = _store_image(client.id, GARDEN_PHOTO, stored)
    living = Design(
        id=living_id,
        business_id=client.business_id,
        client_id=client.id,
        source=DesignSource.designer_uploaded,
        title="Living room - sage feature wall",
        description="Feature wall, cove ceiling and linen curtains.",
        storage_path=living_path,
        specs_json={},
        rooms=["Living Room"],
        is_selected=True,
    )
    garden = Design(
        id=garden_id,
        business_id=client.business_id,
        client_id=client.id,
        source=DesignSource.designer_uploaded,
        title="Living room - garden view",
        description="Alternative layout with a grey sofa and wide windows.",
        storage_path=garden_path,
        specs_json={},
        rooms=["Living Room"],
    )
    db.add_all([living, garden])
    db.flush()

    # Live quotation from the applied AI extraction.
    quotation = Quotation(
        client_id=client.id,
        design_id=living.id,
        status=QuotationStatus.pending,
        checkpoint_id=applied.id,
    )
    db.add(quotation)
    db.flush()
    items = [
        _line_item(quotation, i, spec, applied)
        for i, spec in enumerate(_APPLIED_ITEMS)
    ]
    db.add_all(items)
    db.flush()

    for label, dims, labour, x, y, w, h in _LIVING_HOTSPOTS:
        db.add(
            DesignHotspot(
                design_id=living.id,
                label=label,
                dimensions=dims,
                labour_cost=labour,
                x=x,
                y=y,
                w=w,
                h=h,
                # The feature wall hotspot is already a quotation row.
                quotation_line_item_id=(
                    items[0].id if label == _FEATURE_WALL else None
                ),
            )
        )
    db.flush()

    # Version 1 as first sent; version 2 after the client pushed back on price.
    db.refresh(quotation)
    v1 = create_version(db, quotation, user.id, label="First proposal")
    items[0].negotiated_price = 66000
    items[0].status = QuotationItemStatus.agreed
    items[1].status = QuotationItemStatus.removed
    items[2].negotiated_price = 165000
    db.flush()
    db.refresh(quotation)
    v2 = create_version(db, quotation, user.id, label="After negotiation")

    # Shared links: the designs, and the second quotation version.
    db.add(
        ShareLink(
            client_id=client.id,
            token=share_links.readable_token(client.name),
            design_ids=[str(living.id), str(garden.id)],
            show_prices=False,
            created_by_id=user.id,
            created_at=now - timedelta(days=3),
        )
    )
    question = "Can the wardrobe shutters be in white instead?"
    db.add(
        QuotationShare(
            version_id=v2.id,
            token=share_links.readable_token(client.name),
            show_prices=True,
            created_by_id=user.id,
            created_at=now - timedelta(days=1),
            view_count=3,
            last_viewed_at=now - timedelta(hours=5),
            response_kind="question",
            response_name="Anita Rao",
            response_message=question,
            responded_at=now - timedelta(hours=5),
        )
    )

    # Customer messages: an old question the designer already resolved, a
    # new one still waiting.
    db.add_all(
        [
            QuotationMessage(
                quotation_id=quotation.id,
                version_id=v1.id,
                version_number=v1.number,
                kind="question",
                name="Anita Rao",
                message="Is the false ceiling included in this price?",
                created_at=now - timedelta(days=1, hours=6),
                resolved_at=now - timedelta(days=1),
                resolved_by_id=user.id,
            ),
            QuotationMessage(
                quotation_id=quotation.id,
                version_id=v2.id,
                version_number=v2.number,
                kind="question",
                name="Anita Rao",
                message=question,
                created_at=now - timedelta(hours=5),
            ),
        ]
    )
    db.commit()
    db.refresh(client)
    return client


def image_paths(db: Session, client_id: uuid.UUID) -> list[str]:
    """Storage keys of the client's design images, read before it is deleted."""
    paths = db.execute(
        select(Design.storage_path).where(Design.client_id == client_id)
    ).scalars()
    return [p for p in paths if p]


def delete_stored_images(paths: list[str]) -> None:
    """Remove image files; a leftover file is only wasted space."""
    storage = get_storage()
    for path in paths:
        for key in (path, thumb_path(path), view_path(path)):
            try:
                storage.delete(key)
            except (StorageError, httpx.HTTPError):
                logger.warning("sample_image_delete_failed", path=key)
