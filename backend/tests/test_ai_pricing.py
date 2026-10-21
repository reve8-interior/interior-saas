from decimal import Decimal

import pytest

from backend.services.ai_pricing import (
    call_cost,
    chat_cost,
    chat_price_per_million,
    known_chat_models,
    known_transcription_models,
    transcription_cost,
)


def test_chat_cost_known_model():
    # 10k in * $0.40/M + 2k out * $1.60/M
    assert chat_cost("gpt-4.1-mini", 10_000, 2_000) == Decimal("0.0072")


def test_chat_cost_dated_snapshot_uses_family_price():
    assert chat_cost("gpt-4.1-mini-2025-04-14", 1_000_000, 0) == Decimal(
        "0.40"
    )


def test_chat_cost_longest_prefix_wins():
    # "gpt-4o-mini" must not be priced as "gpt-4o"
    assert chat_cost("gpt-4o-mini", 1_000_000, 0) == Decimal("0.15")
    assert chat_cost("gpt-4o", 1_000_000, 0) == Decimal("2.50")


def test_chat_cost_unknown_model_is_none():
    assert chat_cost("mystery-model", 100, 100) is None


def test_chat_cost_without_any_tokens_is_none():
    assert chat_cost("gpt-4.1-mini", None, None) is None


def test_chat_cost_one_sided_tokens():
    assert chat_cost("gpt-4.1-mini", None, 1_000_000) == Decimal("1.60")
    assert chat_cost("gpt-4.1-mini", 0, 0) == Decimal("0")


@pytest.mark.parametrize(
    ("model", "seconds", "expected"),
    [
        ("whisper-1", 60, Decimal("0.006")),
        ("whisper-1", 90, Decimal("0.009")),
        ("gpt-4o-mini-transcribe", 60, Decimal("0.003")),
        ("gpt-4o-transcribe", 120, Decimal("0.012")),
    ],
)
def test_transcription_cost(model, seconds, expected):
    assert transcription_cost(model, seconds) == expected


def test_transcription_cost_unknown_or_missing_duration():
    assert transcription_cost("whisper-1", None) is None
    assert transcription_cost("nope", 60) is None


def test_call_cost_prefers_audio_when_duration_given():
    assert call_cost("whisper-1", audio_seconds=60) == Decimal("0.006")


def test_call_cost_falls_back_to_tokens():
    cost = call_cost("gpt-4.1-mini", input_tokens=10_000, output_tokens=2_000)
    assert cost == Decimal("0.0072")


def test_call_cost_whisper_without_duration_has_no_cost():
    # Old/other transcribe models report no duration: show "—", not $0.
    assert call_cost("whisper-1", input_tokens=None) is None


def test_price_per_million_known_model():
    assert chat_price_per_million("gpt-4.1-mini") == (
        Decimal("0.40"),
        Decimal("1.60"),
    )


def test_price_per_million_dated_snapshot_and_longest_prefix():
    assert chat_price_per_million("gpt-4.1-mini-2025-04-14") == (
        Decimal("0.40"),
        Decimal("1.60"),
    )
    assert chat_price_per_million("gpt-4o-mini")[0] == Decimal("0.15")


def test_price_per_million_unknown_model_is_none():
    assert chat_price_per_million("mystery-model") is None


def test_known_chat_models_sorted_cheapest_input_first():
    models = known_chat_models()
    inputs = [chat_price_per_million(m)[0] for m in models]
    assert inputs == sorted(inputs)
    assert "gpt-4.1-mini" in models


def test_known_transcription_models_map_to_decimal_per_minute():
    prices = known_transcription_models()
    assert prices["whisper-1"] == Decimal("0.006")
    assert all(isinstance(p, Decimal) for p in prices.values())
