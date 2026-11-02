"""The admin-set chat model and the priced catalogue."""

from types import SimpleNamespace

from backend.services.ai_models import (
    DEFAULT_CHAT_MODEL,
    chat_model,
    model_catalog,
)


def test_unset_model_uses_the_platform_default() -> None:
    assert chat_model(None) == DEFAULT_CHAT_MODEL
    assert chat_model(SimpleNamespace(openai_chat_model=None)) == (
        DEFAULT_CHAT_MODEL
    )


def test_admin_model_wins() -> None:
    assert chat_model(SimpleNamespace(openai_chat_model="gpt-4o")) == "gpt-4o"


def test_catalog_lists_priced_models_cheapest_first() -> None:
    catalog = model_catalog()
    inputs = [m.input_per_million_usd for m in catalog.chat]
    assert inputs == sorted(inputs)
    assert {m.model for m in catalog.chat} >= {"gpt-4.1-mini", "gpt-5"}
    assert "whisper-1" in {m.model for m in catalog.transcription}


def test_priced_model_has_per_million_and_estimate() -> None:
    mini = next(m for m in model_catalog().chat if m.model == "gpt-4.1-mini")
    assert float(mini.input_per_million_usd) == 0.40
    assert float(mini.output_per_million_usd) == 1.60
    # 3000 in + 1000 out tokens
    assert float(mini.est_cost_per_extraction_usd) == 0.0028


def test_default_model_is_in_the_catalog() -> None:
    catalog = model_catalog()
    assert catalog.default_chat_model == DEFAULT_CHAT_MODEL
    assert DEFAULT_CHAT_MODEL in {m.model for m in catalog.chat}
