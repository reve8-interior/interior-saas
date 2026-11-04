import uuid
from typing import Annotated, Literal
from urllib.parse import urlparse

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
)

MAX_SERVICES = 8
MAX_SOCIALS = 6

SiteTheme = Literal[
    "classic",
    "warm-linen",
    "sage-stone",
    "midnight-gold",
    "mono-editorial",
    "blush-modern",
]

Text = Annotated[str, StringConstraints(strip_whitespace=True)]


def _http_url(value: str) -> str:
    """Only http(s) links with a host: blocks javascript:/data: URLs."""
    parsed = urlparse(value.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("URL must start with http:// or https://")
    return value.strip()


HttpUrlStr = Annotated[str, Field(max_length=500), AfterValidator(_http_url)]


class SiteAssetUrl(BaseModel):
    """Signed media URL of an uploaded branding image."""

    url: str


class SiteService(BaseModel):
    """One offering shown on the site."""

    title: Text = Field(min_length=1, max_length=80)
    description: Text = Field(default="", max_length=500)


class SiteSocial(BaseModel):
    """One social/profile link."""

    label: Text = Field(min_length=1, max_length=40)
    url: HttpUrlStr


class SiteSettingsUpdate(BaseModel):
    """Partial update: omitted fields are left alone, null/"" clears text."""

    model_config = ConfigDict(extra="forbid")

    tagline: Text | None = Field(default=None, max_length=120)
    about: Text | None = Field(default=None, max_length=4000)
    address: Text | None = Field(default=None, max_length=500)
    phone: Text | None = Field(default=None, max_length=50)
    email: Text | None = Field(default=None, max_length=254)
    services: list[SiteService] | None = Field(
        default=None, max_length=MAX_SERVICES
    )
    socials: list[SiteSocial] | None = Field(
        default=None, max_length=MAX_SOCIALS
    )
    hide_badge: bool | None = None
    theme: SiteTheme | None = None


class SiteSettingsRead(BaseModel):
    slug: str | None
    published: bool
    mode: Literal["site", "gallery"]
    tagline: str | None
    about: str | None
    address: str | None
    phone: str | None
    email: str | None
    services: list[SiteService]
    socials: list[SiteSocial]
    hide_badge: bool
    can_hide_badge: bool
    theme: SiteTheme
    logo_url: str | None
    hero_url: str | None


class SlugBody(BaseModel):
    slug: str = Field(max_length=200)


class SlugCheck(BaseModel):
    slug: str
    available: bool
    reason: str | None = None


# --- Public site views -------------------------------------------------------
# Whitelisted fields only: these models are built field by field, never from
# ORM rows, so hotspots, prices, client data and storage paths cannot leak.


class PublicDesign(BaseModel):
    id: uuid.UUID
    title: str | None
    description: str | None
    image_url: str | None
    thumb_url: str | None


class PublicProjectDesign(PublicDesign):
    rooms: list[str]


class PublicProject(BaseModel):
    id: uuid.UUID
    title: str
    location: str | None
    year: int | None
    category: str | None
    story: str | None
    cover_url: str | None
    designs: list[PublicProjectDesign]


class SiteContact(BaseModel):
    email: str | None
    phone: str | None
    address: str | None


class SiteRedirectView(BaseModel):
    """The slug is an old alias; the client should go to the current one."""

    mode: Literal["redirect"] = "redirect"
    slug: str


class GalleryView(BaseModel):
    """Simple image gallery (Free or lapsed plan)."""

    mode: Literal["gallery"] = "gallery"
    business_name: str
    designs: list[PublicDesign]


class FullSiteView(BaseModel):
    """Full designer website."""

    mode: Literal["site"] = "site"
    business_name: str
    slug: str | None
    logo_url: str | None
    hero_url: str | None
    tagline: str | None
    about: str | None
    services: list[SiteService]
    socials: list[SiteSocial]
    contact: SiteContact
    show_badge: bool
    theme: SiteTheme
    projects: list[PublicProject]


SiteView = Annotated[GalleryView | FullSiteView, Field(discriminator="mode")]

PublicSiteResponse = Annotated[
    SiteRedirectView | GalleryView | FullSiteView,
    Field(discriminator="mode"),
]
