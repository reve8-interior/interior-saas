"""Whether a business's public page is a full website or a plain gallery."""

from typing import Literal

from sqlalchemy.orm import Session

from ..models.business import Business
from .plan_limits import get_plan
from .subscription import is_expired


def site_mode(db: Session, business: Business) -> Literal["site", "gallery"]:
    """ "site" iff the business's plan includes the website builder.

    Resolves the plan exactly as effective_limits does (aliases applied,
    missing row falls back to built-in defaults). A lapsed business
    (access_expires_at passed) serves the gallery even on a paid plan; a
    null expiry means no limit.
    """
    if is_expired(business):
        return "gallery"
    return "site" if get_plan(db, business.plan).website_enabled else "gallery"
