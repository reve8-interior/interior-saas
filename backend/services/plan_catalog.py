"""Built-in plans: seeded on startup and used when a plan row is missing.

The database rows are the source of truth once seeded; the platform admin
edits them from the plans page. These values only fill in plans that don't
exist yet, so editing a seeded plan is never overwritten.
"""

from ..schemas.plan import PlanCreate

FREE_SLUG = "free"

# Slugs that existed before plans became editable.
PLAN_ALIASES: dict[str, str] = {"pro": "studio"}

DEFAULT_PLANS: tuple[PlanCreate, ...] = (
    PlanCreate(
        slug="free",
        name="Free",
        tagline="Try it with your first clients",
        sort_order=0,
        max_users=1,
        max_clients=3,
        max_quotation_versions=2,
        max_images=20,
        max_image_mb=5,
        max_portfolio_designs=10,
        ai_credits_monthly=10,
        highlights=["Watermarked exports", "Community support"],
    ),
    PlanCreate(
        slug="solo",
        name="Solo",
        tagline="For you and up to two others",
        sort_order=1,
        price_monthly_inr=499,
        price_yearly_inr=4990,
        max_users=3,
        max_clients=25,
        max_quotation_versions=10,
        max_images=300,
        max_image_mb=8,
        max_portfolio_designs=50,
        ai_credits_monthly=50,
        clean_export=True,
        highlights=["Clean exports", "Email support"],
    ),
    PlanCreate(
        slug="studio",
        name="Studio",
        tagline="For a studio of up to ten",
        sort_order=2,
        is_recommended=True,
        price_monthly_inr=999,
        price_yearly_inr=9990,
        max_users=10,
        max_clients=None,
        max_quotation_versions=None,
        max_images=3000,
        max_image_mb=10,
        max_portfolio_designs=None,
        ai_credits_monthly=200,
        clean_export=True,
        highlights=["Unlimited clients and quotation versions"],
    ),
    PlanCreate(
        slug="studio_pro",
        name="Studio Pro",
        tagline="Unlimited people, your own brand",
        sort_order=3,
        price_monthly_inr=2499,
        price_yearly_inr=24990,
        max_users=None,
        max_clients=None,
        max_quotation_versions=None,
        max_images=12000,
        max_image_mb=15,
        max_portfolio_designs=None,
        ai_credits_monthly=600,
        clean_export=True,
        branded_export=True,
        bulk_materials_import=True,
        priority_support=True,
        highlights=["Your logo on exports", "Bulk materials import"],
    ),
)

DEFAULTS_BY_SLUG: dict[str, PlanCreate] = {p.slug: p for p in DEFAULT_PLANS}
