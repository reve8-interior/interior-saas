"""GET /ai/models: tiers offered to the caller's business."""

from backend.models.user import UserRole
from backend.services.ai_models import (
    DEFAULT_TIER,
    DEFAULT_TIER_MODELS,
    ModelTier,
)

from .conftest import as_owner, auth, make_business, make_user

URL = "/api/v1/ai/models"


def test_requires_authentication(api):
    assert api.get(URL).status_code == 401


def test_lists_all_tiers_cheapest_first_with_platform_defaults(api, db):
    user = make_user(db, role=UserRole.designer, business=make_business(db))
    r = api.get(URL, headers=auth(user))
    assert r.status_code == 200
    body = r.json()
    assert [o["tier"] for o in body] == ["economy", "balanced", "premium"]
    assert [o["model"] for o in body] == [
        DEFAULT_TIER_MODELS[t] for t in ModelTier
    ]
    assert [o["tier"] for o in body if o["is_default"]] == [DEFAULT_TIER.value]


def test_business_override_is_reflected_and_priced(api, db):
    biz = make_business(db, openai_model_economy="gpt-4.1-mini")
    user = make_user(db, role=UserRole.designer, business=biz)
    economy = api.get(URL, headers=auth(user)).json()[0]
    assert economy["model"] == "gpt-4.1-mini"
    assert float(economy["input_per_million_usd"]) == 0.40
    assert float(economy["est_cost_per_extraction_usd"]) == 0.0028


def test_unpriced_override_is_listed_with_null_prices(api, db):
    biz = make_business(db, openai_model_premium="mystery-model")
    user = make_user(db, role=UserRole.designer, business=biz)
    premium = api.get(URL, headers=auth(user)).json()[2]
    assert premium["model"] == "mystery-model"
    assert premium["input_per_million_usd"] is None
    assert premium["est_cost_per_extraction_usd"] is None


def test_one_business_never_sees_another_businesss_models(api, db):
    a = make_business(db, openai_model_economy="gpt-4.1-mini")
    b = make_business(db, openai_model_economy="gpt-4o-mini")
    user_a = make_user(db, role=UserRole.designer, business=a)
    user_b = make_user(db, role=UserRole.designer, business=b)
    as_owner(db)
    assert api.get(URL, headers=auth(user_a)).json()[0]["model"] == (
        "gpt-4.1-mini"
    )
    assert api.get(URL, headers=auth(user_b)).json()[0]["model"] == (
        "gpt-4o-mini"
    )


def test_superadmin_without_business_gets_platform_defaults(api, db):
    owner = make_user(db, role=UserRole.superadmin)
    r = api.get(URL, headers=auth(owner))
    assert r.status_code == 200
    assert [o["model"] for o in r.json()] == [
        DEFAULT_TIER_MODELS[t] for t in ModelTier
    ]
