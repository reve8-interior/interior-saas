"""The chat model behind a business's AI features.

The platform admin picks one model per business; users never choose.
Credits (not models or prices) are what users see.
"""

from decimal import Decimal

from pydantic import BaseModel

from ..models.business import Business
from .ai_pricing import (
    chat_cost,
    chat_price_per_million,
    known_chat_models,
    known_transcription_models,
)

# Used when the admin hasn't assigned a model to the business.
DEFAULT_CHAT_MODEL = "gpt-4.1"

# A typical meeting extraction, used to turn per-token prices into one
# number an admin can compare at a glance.
_TYPICAL_INPUT_TOKENS = 3_000
_TYPICAL_OUTPUT_TOKENS = 1_000


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
    default_chat_model: str


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
        default_chat_model=DEFAULT_CHAT_MODEL,
    )


def chat_model(business: Business | None) -> str:
    """The business's chat model, or the platform default."""
    return (
        business.openai_chat_model if business else None
    ) or DEFAULT_CHAT_MODEL
