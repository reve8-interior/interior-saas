"""OpenAI list prices (USD) used to put a money figure on each AI call.

Prices are per 1M tokens for chat models and per minute of audio for
transcription models. Unknown models have no price, so their cost is None
(shown as "—") rather than a wrong number. Update the tables when OpenAI
changes its pricing; stored costs are not recomputed.
"""

from decimal import Decimal

# model prefix -> (input $/1M tokens, output $/1M tokens)
_CHAT_PRICES: dict[str, tuple[str, str]] = {
    "gpt-4o-mini": ("0.15", "0.60"),
    "gpt-4o": ("2.50", "10.00"),
    "gpt-4.1-nano": ("0.10", "0.40"),
    "gpt-4.1-mini": ("0.40", "1.60"),
    "gpt-4.1": ("2.00", "8.00"),
    "gpt-5-nano": ("0.05", "0.40"),
    "gpt-5-mini": ("0.25", "2.00"),
    "gpt-5": ("1.25", "10.00"),
}

# model prefix -> $/minute of audio
_TRANSCRIBE_PRICES: dict[str, str] = {
    "whisper-1": "0.006",
    "gpt-4o-mini-transcribe": "0.003",
    "gpt-4o-transcribe": "0.006",
}

_MILLION = Decimal(1_000_000)


def _lookup(table: dict, model: str):
    """Longest-prefix match, so dated snapshots resolve to their family."""
    for prefix in sorted(table, key=len, reverse=True):
        if model.startswith(prefix):
            return table[prefix]
    return None


def chat_cost(
    model: str, input_tokens: int | None, output_tokens: int | None
) -> Decimal | None:
    price = _lookup(_CHAT_PRICES, model)
    if price is None or (input_tokens is None and output_tokens is None):
        return None
    in_price, out_price = Decimal(price[0]), Decimal(price[1])
    return (
        Decimal(input_tokens or 0) * in_price
        + Decimal(output_tokens or 0) * out_price
    ) / _MILLION


def chat_price_per_million(model: str) -> tuple[Decimal, Decimal] | None:
    """(input, output) USD per 1M tokens, or None for an unpriced model."""
    price = _lookup(_CHAT_PRICES, model)
    if price is None:
        return None
    return Decimal(price[0]), Decimal(price[1])


def known_chat_models() -> list[str]:
    """Priced chat models, cheapest input price first."""
    return sorted(_CHAT_PRICES, key=lambda m: Decimal(_CHAT_PRICES[m][0]))


def known_transcription_models() -> dict[str, Decimal]:
    """Transcription model -> USD per minute of audio."""
    return {m: Decimal(p) for m, p in _TRANSCRIBE_PRICES.items()}


def transcription_cost(model: str, seconds: float | None) -> Decimal | None:
    price = _lookup(_TRANSCRIBE_PRICES, model)
    if price is None or seconds is None:
        return None
    return Decimal(str(seconds)) / Decimal(60) * Decimal(price)


def call_cost(
    model: str,
    *,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    audio_seconds: float | None = None,
) -> Decimal | None:
    """Cost of one call; audio takes precedence when a duration is given."""
    if audio_seconds is not None:
        return transcription_cost(model, audio_seconds)
    return chat_cost(model, input_tokens, output_tokens)
