"""Tier options shown to users: order, labels, defaults and prices."""

from types import SimpleNamespace

from backend.services.ai_models import (
    DEFAULT_TIER,
    DEFAULT_TIER_MODELS,
    ModelTier,
    model_catalog,
    model_options,
    tier_model,
)


def business(**models: str | None) -> SimpleNamespace:
    return SimpleNamespace(
        openai_model_economy=models.get("economy"),
        openai_model_balanced=models.get("balanced"),
        openai_model_premium=models.get("premium"),
    )


def test_options_are_cheapest_first_with_labels() -> None:
    options = model_options(None)
    assert [o.tier for o in options] == [
        ModelTier.economy,
        ModelTier.balanced,
        ModelTier.premium,
    ]
    assert [o.label for o in options] == ["Economy", "Balanced", "Premium"]


def test_unset_tiers_use_platform_defaults() -> None:
    options = model_options(business())
    assert [o.model for o in options] == [
        DEFAULT_TIER_MODELS[t] for t in ModelTier
    ]


def test_admin_models_override_defaults_per_tier() -> None:
    biz = business(economy="gpt-4o-mini", premium="gpt-4o")
    assert tier_model(biz, ModelTier.economy) == "gpt-4o-mini"
    assert tier_model(biz, ModelTier.premium) == "gpt-4o"
    assert (
        tier_model(biz, ModelTier.balanced)
        == DEFAULT_TIER_MODELS[ModelTier.balanced]
    )


def test_exactly_one_default_tier() -> None:
    defaults = [o.tier for o in model_options(None) if o.is_default]
    assert defaults == [DEFAULT_TIER]


def test_priced_model_has_per_million_and_estimate() -> None:
    option = model_options(business(economy="gpt-4.1-mini"))[0]
    assert float(option.input_per_million_usd) == 0.40
    assert float(option.output_per_million_usd) == 1.60
    # 3000 in + 1000 out tokens
    assert float(option.est_cost_per_extraction_usd) == 0.0028


def test_catalog_lists_priced_models_cheapest_first() -> None:
    catalog = model_catalog()
    inputs = [m.input_per_million_usd for m in catalog.chat]
    assert inputs == sorted(inputs)
    assert {m.model for m in catalog.chat} >= {"gpt-4.1-mini", "gpt-5"}
    assert catalog.tier_defaults == DEFAULT_TIER_MODELS
    assert "whisper-1" in {m.model for m in catalog.transcription}


def test_every_default_tier_model_is_in_the_catalog() -> None:
    names = {m.model for m in model_catalog().chat}
    assert set(DEFAULT_TIER_MODELS.values()) <= names


def test_unpriced_model_has_no_price_instead_of_a_wrong_one() -> None:
    option = model_options(business(economy="mystery-model"))[0]
    assert option.model == "mystery-model"
    assert option.input_per_million_usd is None
    assert option.est_cost_per_extraction_usd is None
