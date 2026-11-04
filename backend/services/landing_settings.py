"""Landing-page switches, stored in app_settings."""

from sqlalchemy.orm import Session

from ..models.app_setting import AppSetting

LANDING_PRICING_KEY = "landing_pricing"


def get_show_pricing(db: Session) -> bool:
    """Whether the pricing table is shown; on until an admin turns it off."""
    row = db.get(AppSetting, LANDING_PRICING_KEY)
    if row and isinstance(row.value, dict):
        return bool(row.value.get("enabled", True))
    return True


def set_show_pricing(db: Session, enabled: bool) -> None:
    """Persist the switch (caller commits)."""
    row = db.get(AppSetting, LANDING_PRICING_KEY)
    if row:
        row.value = {"enabled": enabled}
    else:
        db.add(AppSetting(key=LANDING_PRICING_KEY, value={"enabled": enabled}))
