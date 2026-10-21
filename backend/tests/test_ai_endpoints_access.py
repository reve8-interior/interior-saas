"""AI endpoints refuse politely when a business has no usable OpenAI key."""

import asyncio
import io
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.models.user import UserRole
from backend.services import transcription
from backend.services.secret_box import encrypt_secret
from backend.services.transcription import transcribe_audio

from .conftest import (
    as_owner,
    auth,
    make_business,
    make_client_row,
    make_user,
)

HINT = "ask your admin"


def run(coro):
    return asyncio.run(coro)


def no_key_user(db):
    return make_user(db, role=UserRole.admin, business=make_business(db))


def test_checkpoint_extract_without_key_is_503_with_hint(api, db):
    user = no_key_user(db)
    from .conftest import as_business

    as_business(db, user.business_id)
    client = make_client_row(db, "C")
    r = api.post(
        f"/api/v1/clients/{client.id}/checkpoints/extract",
        headers=auth(user),
        data={"text": "Master bedroom wardrobe 8x7 ft"},
    )
    assert r.status_code == 503
    assert HINT in r.json()["detail"].lower()


def test_materials_ai_extract_without_key_is_503_with_hint(api, db):
    user = no_key_user(db)
    r = api.post(
        "/api/v1/materials/ai-extract",
        headers=auth(user),
        files={"file": ("rates.png", io.BytesIO(b"png"), "image/png")},
    )
    assert r.status_code == 503
    assert HINT in r.json()["detail"].lower()


def test_failed_attempt_without_key_logs_no_usage(api, db):
    from sqlalchemy import func, select

    from backend.models.agent_audit_log import AgentAuditLog

    user = no_key_user(db)
    api.post(
        "/api/v1/materials/ai-extract",
        headers=auth(user),
        files={"file": ("rates.png", io.BytesIO(b"png"), "image/png")},
    )
    as_owner(db)
    assert db.scalar(select(func.count(AgentAuditLog.id))) == 0


def test_materials_ai_extract_logs_cost_with_business_model(api, db):
    from sqlalchemy import select

    from backend.models.agent_audit_log import AgentAuditLog

    biz = make_business(
        db,
        openai_api_key_enc=encrypt_secret("sk-" + "q" * 30),
        openai_model_balanced="gpt-4o",
        openai_model_premium="gpt-5",
    )
    user = make_user(db, role=UserRole.admin, business=biz)
    fake_response = SimpleNamespace(
        usage=SimpleNamespace(prompt_tokens=1_000_000, completion_tokens=0),
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content='[{"name":"Ply","category":"wood","unit":"sqft","unit_cost":10}]'
                )
            )
        ],
    )
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = fake_response
    with patch("openai.OpenAI", return_value=fake_client) as ctor:
        r = api.post(
            "/api/v1/materials/ai-extract",
            headers=auth(user),
            files={"file": ("rates.png", io.BytesIO(b"png"), "image/png")},
        )
    assert r.status_code == 200, r.text
    assert ctor.call_args.kwargs["api_key"] == "sk-" + "q" * 30
    assert (
        fake_client.chat.completions.create.call_args.kwargs["model"]
        == "gpt-4o"
    )
    as_owner(db)
    log = db.scalars(select(AgentAuditLog)).one()
    assert log.model == "gpt-4o"
    assert log.business_id == biz.id
    assert float(log.cost_usd) == pytest.approx(2.50)  # 1M input tokens


def test_materials_ai_extract_uses_the_requested_tier(api, db):
    biz = make_business(
        db,
        openai_api_key_enc=encrypt_secret("sk-" + "q" * 30),
        openai_model_balanced="gpt-4o",
        openai_model_premium="gpt-5",
    )
    user = make_user(db, role=UserRole.admin, business=biz)
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = SimpleNamespace(
        usage=None,
        choices=[SimpleNamespace(message=SimpleNamespace(content="[]"))],
    )
    with patch("openai.OpenAI", return_value=fake_client):
        r = api.post(
            "/api/v1/materials/ai-extract",
            headers=auth(user),
            files={"file": ("rates.png", io.BytesIO(b"png"), "image/png")},
            data={"tier": "premium"},
        )
    assert r.status_code == 200, r.text
    assert (
        fake_client.chat.completions.create.call_args.kwargs["model"]
        == "gpt-5"
    )


def test_model_catalog_is_superadmin_only(api, db):
    biz = make_business(db)
    admin = make_user(db, role=UserRole.admin, business=biz)
    assert api.get("/api/v1/ai/model-catalog").status_code == 401
    r = api.get("/api/v1/ai/model-catalog", headers=auth(admin))
    assert r.status_code == 403
    as_owner(db)
    owner = make_user(db, role=UserRole.superadmin)
    r = api.get("/api/v1/ai/model-catalog", headers=auth(owner))
    assert r.status_code == 200
    body = r.json()
    assert body["chat"] and body["transcription"]
    assert set(body["tier_defaults"]) == {"economy", "balanced", "premium"}


def test_unknown_tier_is_rejected(api, db):
    biz = make_business(
        db, openai_api_key_enc=encrypt_secret("sk-" + "q" * 30)
    )
    user = make_user(db, role=UserRole.admin, business=biz)
    r = api.post(
        "/api/v1/materials/ai-extract",
        headers=auth(user),
        files={"file": ("rates.png", io.BytesIO(b"png"), "image/png")},
        data={"tier": "platinum"},
    )
    assert r.status_code == 422


# ── transcription wrapper ──────────────────────────────────────────────────
def fake_openai(response):
    create = AsyncMock(return_value=response)
    client = SimpleNamespace(
        audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create))
    )
    return client, create


def test_whisper_asks_for_verbose_json_and_reads_duration():
    client, create = fake_openai(SimpleNamespace(text="hello", duration=12.5))
    with patch.object(
        transcription, "AsyncOpenAI", return_value=client
    ) as ctor:
        result = run(transcribe_audio(b"abc", "a.mp3", "sk-x", "whisper-1"))
    assert (result.text, result.duration_seconds) == ("hello", 12.5)
    assert ctor.call_args.kwargs["api_key"] == "sk-x"
    kwargs = create.call_args.kwargs
    assert kwargs["model"] == "whisper-1"
    assert kwargs["response_format"] == "verbose_json"
    assert kwargs["file"].name == "a.mp3"


def test_gpt4o_transcribe_uses_plain_json_without_duration():
    client, create = fake_openai(SimpleNamespace(text="hi"))
    with patch.object(transcription, "AsyncOpenAI", return_value=client):
        result = run(
            transcribe_audio(b"abc", "a.wav", "sk-x", "gpt-4o-transcribe")
        )
    assert result.text == "hi"
    assert result.duration_seconds is None
    assert create.call_args.kwargs["response_format"] == "json"
    assert create.call_args.kwargs["model"] == "gpt-4o-transcribe"


def test_transcription_failure_becomes_runtime_error():
    create = AsyncMock(side_effect=ValueError("boom"))
    client = SimpleNamespace(
        audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create))
    )
    with patch.object(transcription, "AsyncOpenAI", return_value=client):
        with pytest.raises(RuntimeError, match="Whisper transcription failed"):
            run(transcribe_audio(b"abc", "a.mp3", "sk-x", "whisper-1"))
