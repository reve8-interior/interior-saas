import uuid
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from backend.models.agent_audit_log import AgentAuditLog
from backend.models.user import UserRole
from backend.services.ai_models import (
    DEFAULT_TIER,
    DEFAULT_TIER_MODELS,
    ModelTier,
)
from backend.services.ai_access import (
    DEFAULT_WHISPER_MODEL,
    OP_AUDIO_TRANSCRIBE,
    OP_CHECKPOINT_EXTRACT,
    log_ai_usage,
    resolve_chat_model,
    resolve_openai_access,
    resolve_whisper_model,
)
from backend.services.secret_box import encrypt_secret

from .conftest import as_business, as_owner, make_business, make_user

KEY = "sk-" + "z" * 30


def business_with_key(db, **kw):
    return make_business(db, openai_api_key_enc=encrypt_secret(KEY), **kw)


# ── resolve_openai_access ──────────────────────────────────────────────────
def test_no_business_means_ai_is_off(db):
    user = make_user(db)
    with pytest.raises(HTTPException) as exc:
        resolve_openai_access(user)
    assert exc.value.status_code == 503
    assert "ask your admin" in exc.value.detail


def test_business_without_key_gets_friendly_message(db):
    user = make_user(db, business=make_business(db))
    with pytest.raises(HTTPException) as exc:
        resolve_openai_access(user)
    assert exc.value.status_code == 503
    assert "aren't set up" in exc.value.detail
    assert "ask your admin" in exc.value.detail


def test_undecryptable_key_asks_admin_to_re_add(db):
    biz = make_business(db, openai_api_key_enc="garbage-not-fernet")
    user = make_user(db, business=biz)
    with pytest.raises(HTTPException) as exc:
        resolve_openai_access(user)
    assert exc.value.status_code == 503
    assert "set up again" in exc.value.detail


def test_access_uses_business_key_and_default_models(db):
    user = make_user(db, business=business_with_key(db))
    access = resolve_openai_access(user)
    assert access.api_key == KEY
    assert access.model == DEFAULT_TIER_MODELS[DEFAULT_TIER]
    assert access.whisper_model == DEFAULT_WHISPER_MODEL


def test_access_uses_business_models_when_set(db):
    biz = business_with_key(
        db,
        openai_model_balanced="gpt-4o",
        openai_whisper_model="gpt-4o-transcribe",
    )
    access = resolve_openai_access(make_user(db, business=biz))
    assert access.model == "gpt-4o"
    assert access.whisper_model == "gpt-4o-transcribe"


def test_access_resolves_the_requested_tier(db):
    biz = business_with_key(
        db,
        openai_model_economy="gpt-4o-mini",
        openai_model_premium="gpt-5",
    )
    user = make_user(db, business=biz)
    assert resolve_openai_access(user, ModelTier.economy).model == (
        "gpt-4o-mini"
    )
    assert resolve_openai_access(user, ModelTier.premium).model == "gpt-5"
    # A tier the admin left unset falls back to its platform default.
    assert (
        resolve_openai_access(user, ModelTier.balanced).model
        == (DEFAULT_TIER_MODELS[ModelTier.balanced])
    )


def test_model_resolvers_fall_back_without_business(db):
    user = make_user(db)
    assert resolve_chat_model(user) == DEFAULT_TIER_MODELS[DEFAULT_TIER]
    assert resolve_whisper_model(user) == DEFAULT_WHISPER_MODEL


def test_models_are_per_business(db):
    a = make_business(db, openai_model_balanced="gpt-4o")
    b = make_business(db, openai_model_balanced="gpt-5-mini")
    assert resolve_chat_model(make_user(db, business=a)) == "gpt-4o"
    assert resolve_chat_model(make_user(db, business=b)) == "gpt-5-mini"


# ── log_ai_usage ───────────────────────────────────────────────────────────
def test_chat_call_is_priced_from_tokens(db):
    log = log_ai_usage(
        db,
        operation=OP_CHECKPOINT_EXTRACT,
        model="gpt-4.1-mini",
        latency_ms=1200,
        status="success",
        input_tokens=10_000,
        output_tokens=2_000,
    )
    assert log.cost_usd == Decimal("0.007200")
    assert log.latency_ms == 1200


def test_transcription_is_priced_from_audio_length(db):
    log = log_ai_usage(
        db,
        operation=OP_AUDIO_TRANSCRIBE,
        model="whisper-1",
        latency_ms=900,
        status="success",
        audio_seconds=120,
    )
    assert log.cost_usd == Decimal("0.012000")


def test_unpriced_calls_store_no_cost(db):
    unknown = log_ai_usage(
        db,
        operation=OP_CHECKPOINT_EXTRACT,
        model="mystery",
        latency_ms=1,
        status="success",
        input_tokens=5,
        output_tokens=5,
    )
    no_duration = log_ai_usage(
        db,
        operation=OP_AUDIO_TRANSCRIBE,
        model="gpt-4o-transcribe",
        latency_ms=1,
        status="success",
    )
    assert unknown.cost_usd is None
    assert no_duration.cost_usd is None


def test_usage_is_stamped_with_the_requests_business(db):
    a, b = make_business(db), make_business(db)
    as_business(db, a.id)
    log = log_ai_usage(
        db,
        operation=OP_CHECKPOINT_EXTRACT,
        model="gpt-4.1-mini",
        latency_ms=10,
        status="success",
        input_tokens=1,
        output_tokens=1,
    )
    assert log.business_id == a.id
    as_business(db, b.id)
    assert db.scalars(select(AgentAuditLog)).all() == []
    as_owner(db)
    assert len(db.scalars(select(AgentAuditLog)).all()) == 1


def test_usage_without_client_is_allowed(db):
    log = log_ai_usage(
        db,
        operation="materials_extract",
        model="gpt-4.1-mini",
        latency_ms=5,
        status="error",
        client_id=None,
    )
    assert log.client_id is None
    assert log.id is not None and isinstance(log.id, uuid.UUID)


def test_designer_role_helper_sanity(db):
    # guards the fixtures used above: users really are created per role
    assert make_user(db, role=UserRole.admin).role == UserRole.admin
