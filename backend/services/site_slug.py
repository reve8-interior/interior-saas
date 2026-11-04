"""Slug rules for the public designer website (/{slug})."""

import re

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import Business, SlugAlias

MIN_LEN = 3
MAX_LEN = 40

# Top-level routes of the app plus the admin /site/* GET paths that a slug
# must never shadow.
RESERVED_SLUGS = frozenset(
    {
        "admin",
        "api",
        "client",
        "dashboard",
        "login",
        "portfolio",
        "share",
        "quotation",
        "_next",
        "static",
        "www",
        "preview",
        "slug-check",
        "pricing",
        "signup",
        "about",
        "terms",
        "privacy",
        "help",
        "blog",
        "settings",
        "auth",
        "invite",
        "app",
        "contact",
        "support",
        "docs",
    }
)


def normalize_slug(raw: str) -> str:
    """Lowercase, dash-separate and strip a raw handle; ValueError if bad."""
    slug = raw.strip().lower()
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    if not MIN_LEN <= len(slug) <= MAX_LEN:
        raise ValueError(
            f"Slug must be {MIN_LEN}-{MAX_LEN} letters, digits or dashes"
        )
    return slug


def is_reserved(slug: str) -> bool:
    return slug in RESERVED_SLUGS


def claim_slug(db: Session, business: Business, raw: str) -> str:
    """Give the business this slug, keeping its old one as a redirect alias.

    Scoped sessions cannot see other businesses' rows (RLS), so uniqueness
    against businesses.slug is enforced by the unique index: the update runs
    in a savepoint and an IntegrityError becomes a 409.
    """
    try:
        slug = normalize_slug(raw)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if is_reserved(slug):
        raise HTTPException(status_code=422, detail="This address is reserved")
    if slug == business.slug:
        return slug

    alias = db.scalar(select(SlugAlias).where(SlugAlias.slug == slug))
    if alias is not None and alias.business_id != business.id:
        raise HTTPException(status_code=409, detail="Address already taken")

    old = business.slug
    try:
        with db.begin_nested():
            business.slug = slug
            if alias is not None:
                # Reclaiming one of its own old slugs: the alias is now live.
                db.delete(alias)
            if old:
                db.add(SlugAlias(slug=old, business_id=business.id))
            db.flush()
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="Address already taken"
        ) from exc
    return slug


def resolve_slug(db: Session, slug: str) -> tuple[Business, bool] | None:
    """Find the business for a public slug; bool is True when via an alias.

    Reads unscoped (public request). Returns None when nothing matches.
    """
    business = db.scalar(select(Business).where(Business.slug == slug))
    if business is not None:
        return business, False
    alias = db.scalar(select(SlugAlias).where(SlugAlias.slug == slug))
    if alias is not None:
        owner = db.get(Business, alias.business_id)
        if owner is not None:
            return owner, True
    return None
