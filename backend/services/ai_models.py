"""Price tiers for the chat model a business offers its users.

The platform admin picks one model per tier for each business; users pick
a tier per request. The tier carries the tag shown in the UI, so the
label stays meaningful whichever model the admin assigns to it.
"""

from decimal import Decimal
from enum import Enum

from pydantic import BaseModel

from ..models.business import Business
from .ai_pricing import (
    chat_cost,
    chat_price_per_million,
    known_chat_models,
    known_transcription_models,
)


class ModelTier(str, Enum):
    economy = "economy"
    balanced = "balanced"
    premium = "premium"


DEFAULT_TIER = ModelTier.balanced

# Used when the admin hasn't assigned a model to a tier.
DEFAULT_TIER_MODELS: dict[ModelTier, str] = {
    ModelTier.economy: "gpt-4.1-mini",
    ModelTier.balanced: "gpt-4.1",
    ModelTier.premium: "gpt-5",
}

TIER_LABELS: dict[ModelTier, str] = {
    ModelTier.economy: "Economy",
    ModelTier.balanced: "Balanced",
    ModelTier.premium: "Premium",
}

TIER_BLURBS: dict[ModelTier, str] = {
    ModelTier.economy: (
        "Quick and cheapest. Good for short, clear meeting notes."
    ),
    ModelTier.balanced: ("Reliable for most meetings, at a fair price."),
    ModelTier.premium: (
        "Most careful reading. Best for long or messy conversations "
        "with many rooms or changes."
    ),
}

# A typical meeting extraction, used to turn per-token prices into one
# number a user can compare at a glance.
_TYPICAL_INPUT_TOKENS = 3_000
_TYPICAL_OUTPUT_TOKENS = 1_000


class ModelOption(BaseModel):
    tier: ModelTier
    label: str
    blurb: str
    model: str
    is_default: bool
    # None when the model has no known list price.
    input_per_million_usd: Decimal | None = None
    output_per_million_usd: Decimal | None = None
    est_cost_per_extraction_usd: Decimal | None = None


class CatalogChatModel(BaseModel):
    model: str
    input_per_million_usd: Decimal
    output_per_million_usd: Decimal
    est_cost_per_extraction_usd: Decimal


class CatalogTranscriptionModel(BaseModel):
    model: str
    per_minute_usd: Decimal


class ModelCatalog(BaseModel):
    """Every priced model an admin can assign, for the settings page."""

    chat: list[CatalogChatModel]
    transcription: list[CatalogTranscriptionModel]
    tier_defaults: dict[ModelTier, str]


def model_catalog() -> ModelCatalog:
    chat: list[CatalogChatModel] = []
    for model in known_chat_models():
        price = chat_price_per_million(model)
        cost = chat_cost(model, _TYPICAL_INPUT_TOKENS, _TYPICAL_OUTPUT_TOKENS)
        if price and cost is not None:
            chat.append(
                CatalogChatModel(
                    model=model,
                    input_per_million_usd=price[0],
                    output_per_million_usd=price[1],
                    est_cost_per_extraction_usd=cost,
                )
            )
    return ModelCatalog(
        chat=chat,
        transcription=[
            CatalogTranscriptionModel(model=m, per_minute_usd=p)
            for m, p in known_transcription_models().items()
        ],
        tier_defaults=dict(DEFAULT_TIER_MODELS),
    )


def tier_model(business: Business | None, tier: ModelTier) -> str:
    """The model behind a tier for this business, or the platform default."""
    chosen = getattr(business, f"openai_model_{tier.value}", None)
    return chosen or DEFAULT_TIER_MODELS[tier]


def model_options(business: Business | None) -> list[ModelOption]:
    """All three tiers, cheapest first, with prices for the UI."""
    options: list[ModelOption] = []
    for tier in ModelTier:
        model = tier_model(business, tier)
        price = chat_price_per_million(model)
        options.append(
            ModelOption(
                tier=tier,
                label=TIER_LABELS[tier],
                blurb=TIER_BLURBS[tier],
                model=model,
                is_default=tier == DEFAULT_TIER,
                input_per_million_usd=price[0] if price else None,
                output_per_million_usd=price[1] if price else None,
                est_cost_per_extraction_usd=chat_cost(
                    model, _TYPICAL_INPUT_TOKENS, _TYPICAL_OUTPUT_TOKENS
                ),
            )
        )
    return options
