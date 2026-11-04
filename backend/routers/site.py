"""Designer website: admin endpoints (settings, slug, publish, branding)."""

import re
import uuid
from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core import get_db
from ..core.logging import logger
from ..models.business import Business
from ..models.slug_alias import SlugAlias
from ..models.user import User
from ..schemas.site import (
    FullSiteView,
    GalleryView,
    PublicSiteResponse,
    SiteAssetUrl,
    SiteRedirectView,
    SiteSettingsRead,
    SiteSettingsUpdate,
    SiteView,
    SlugBody,
    SlugCheck,
)
from ..services import rate_limit
from ..services.plan_limits import get_plan
from ..services.site_access import site_mode
from ..services.site_slug import MAX_LEN as MAX_SLUG_LEN
from ..services.site_slug import (
    claim_slug,
    is_reserved,
    normalize_slug,
    resolve_slug,
)
from ..services.site_view import build_site_view
from ..services.image_quota import MB, effective_max_bytes
from ..services.storage import (
    CONTENT_TYPES,
    StorageError,
    get_storage,
    signed_media_url,
    sniff_image_ext,
)
from .deps import require_business_admin

router = APIRouter()
public_router = APIRouter()

BrandingKind = Literal["logo", "hero"]


def _upload_branding(
    kind: BrandingKind, file: UploadFile, db: Session, user: User
) -> SiteAssetUrl:
    """Store a logo/hero image, point the business at it, drop the old one.

    Size-limited like design images but exempt from the image-count quota.
    """
    business = db.get(Business, user.business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")

    limit = effective_max_bytes(business, db)
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

    path = f"branding/{business.id}/{kind}-{uuid.uuid4()}.{ext}"
    try:
        get_storage().put(path, data, CONTENT_TYPES[ext])
    except StorageError:
        logger.exception("branding_store_failed", kind=kind)
        raise HTTPException(status_code=502, detail="Could not store image")

    attr = f"{kind}_path"
    old_path = getattr(business, attr)
    setattr(business, attr, path)
    db.commit()
    if old_path:
        try:
            get_storage().delete(old_path)
        except StorageError:
            # The row now points at the new file; the old one is only waste.
            logger.warning("branding_delete_failed", path=old_path)
    return SiteAssetUrl(url=signed_media_url(path))


@router.post("/site/logo", response_model=SiteAssetUrl)
def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_admin),
):
    return _upload_branding("logo", file, db, current_user)


@router.post("/site/hero", response_model=SiteAssetUrl)
def upload_hero(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_admin),
):
    return _upload_branding("hero", file, db, current_user)


def _business(db: Session, user: User) -> Business:
    business = db.get(Business, user.business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


def _media(path: str | None) -> str | None:
    return signed_media_url(path) if path else None


def _read(db: Session, business: Business) -> SiteSettingsRead:
    return SiteSettingsRead(
        slug=business.slug,
        published=business.site_published,
        mode=site_mode(db, business),
        tagline=business.site_tagline,
        about=business.site_about,
        address=business.site_address,
        phone=business.contact_phone,
        email=business.contact_email,
        services=business.site_services or [],
        socials=business.site_socials or [],
        hide_badge=business.hide_badge,
        can_hide_badge=get_plan(db, business.plan).website_remove_badge,
        theme=business.site_theme,
        logo_url=_media(business.logo_path),
        hero_url=_media(business.hero_path),
    )


# Update field -> Business column, for plain nullable text fields.
_TEXT_COLUMNS = {
    "tagline": "site_tagline",
    "about": "site_about",
    "address": "site_address",
    "phone": "contact_phone",
    "email": "contact_email",
}


@router.get("/site", response_model=SiteSettingsRead)
def get_site(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_admin),
):
    return _read(db, _business(db, current_user))


@router.put("/site", response_model=SiteSettingsRead)
def update_site(
    body: SiteSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_admin),
):
    business = _business(db, current_user)
    fields = body.model_dump(exclude_unset=True)
    if (
        fields.get("hide_badge")
        and not get_plan(db, business.plan).website_remove_badge
    ):
        raise HTTPException(
            status_code=403, detail="Your plan cannot remove the badge"
        )
    for name, column in _TEXT_COLUMNS.items():
        if name in fields:
            setattr(business, column, fields[name] or None)
    if body.services is not None:
        business.site_services = [s.model_dump() for s in body.services]
    if body.socials is not None:
        business.site_socials = [s.model_dump() for s in body.socials]
    if body.hide_badge is not None:
        business.hide_badge = body.hide_badge
    if body.theme is not None:
        business.site_theme = body.theme
    db.commit()
    return _read(db, business)


def _slug_problem(db: Session, business: Business, slug: str) -> str | None:
    """Why this normalized slug cannot be claimed, else None."""
    if is_reserved(slug):
        return "This address is reserved"
    if slug == business.slug:
        return None
    alias = db.scalar(select(SlugAlias).where(SlugAlias.slug == slug))
    if alias is not None and alias.business_id != business.id:
        return "Address already taken"
    # RLS hides other businesses' rows, so probe the unique index inside a
    # savepoint that is always rolled back.
    try:
        with db.begin_nested() as savepoint:
            db.execute(
                update(Business)
                .where(Business.id == business.id)
                .values(slug=slug)
                .execution_options(synchronize_session=False)
            )
            savepoint.rollback()
    except IntegrityError:
        return "Address already taken"
    return None


@router.get("/site/slug-check", response_model=SlugCheck)
def check_slug(
    slug: str = Query(default="", max_length=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_admin),
):
    business = _business(db, current_user)
    try:
        normalized = normalize_slug(slug)
    except ValueError as exc:
        return SlugCheck(
            slug=slug.strip().lower(), available=False, reason=str(exc)
        )
    reason = _slug_problem(db, business, normalized)
    return SlugCheck(slug=normalized, available=reason is None, reason=reason)


@router.put("/site/slug", response_model=SiteSettingsRead)
def set_slug(
    body: SlugBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_admin),
):
    business = _business(db, current_user)
    claim_slug(db, business, body.slug)
    db.commit()
    return _read(db, business)


@router.delete("/site/slug", response_model=SiteSettingsRead)
def clear_slug(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_admin),
):
    """Withdraw the public address. Old slugs stay as aliases but 404."""
    business = _business(db, current_user)
    if business.slug:
        business.slug = None
        db.commit()
    return _read(db, business)


@router.post("/site/publish", response_model=SiteSettingsRead)
def publish_site(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_admin),
):
    business = _business(db, current_user)
    if not business.slug:
        raise HTTPException(status_code=422, detail="Choose an address first")
    if site_mode(db, business) != "site":
        raise HTTPException(
            status_code=403, detail="Your plan does not include a website"
        )
    business.site_published = True
    db.commit()
    return _read(db, business)


@router.post("/site/unpublish", response_model=SiteSettingsRead)
def unpublish_site(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_admin),
):
    business = _business(db, current_user)
    business.site_published = False
    db.commit()
    return _read(db, business)


@router.get("/site/preview", response_model=SiteView)
def preview_site(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_admin),
):
    """What the public page would show, published or not."""
    return build_site_view(db, _business(db, current_user))


# --- Public ------------------------------------------------------------------

PUBLIC_RATE_LIMIT = 60
PUBLIC_RATE_WINDOW_S = 60
_SLUG_SHAPE = re.compile(r"[a-z0-9-]+")


def _client_ip(request: Request) -> str:
    """Peer address as uvicorn reports it.

    X-Forwarded-For is not read here: it is client-controlled unless the
    server trusts the proxy. uvicorn rewrites request.client from it only for
    trusted proxies (FORWARDED_ALLOW_IPS), so that setting decides.
    """
    return request.client.host if request.client else "unknown"


@public_router.get("/site/{slug}", response_model=PublicSiteResponse)
def view_site(
    slug: str,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Public site by slug. Every unavailable case is the same 404."""
    if not rate_limit.allow(
        f"site:{_client_ip(request)}", PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_S
    ):
        raise HTTPException(status_code=429, detail="Too many requests")
    unavailable = HTTPException(status_code=404, detail="Site not available")

    slug = slug.strip().lower()
    if len(slug) > MAX_SLUG_LEN or not _SLUG_SHAPE.fullmatch(slug):
        raise unavailable
    found = resolve_slug(db, slug)
    if found is None:
        raise unavailable
    business, was_alias = found
    if not business.is_active or not business.slug:
        raise unavailable

    view: SiteRedirectView | GalleryView | FullSiteView
    if was_alias:
        view = SiteRedirectView(slug=business.slug)
    else:
        view = build_site_view(db, business)
        if isinstance(view, FullSiteView) and not business.site_published:
            raise unavailable
    response.headers["Cache-Control"] = "public, max-age=60"
    return view
