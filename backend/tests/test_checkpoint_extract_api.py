"""Characterization tests for POST /clients/{id}/checkpoints/extract.

The LLM agent and transcription are patched at the module that calls them,
so these tests pin the endpoint's behaviour, not the providers'.
"""

import io
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from sqlalchemy import select

from backend.agents.checkpoint_agent import (
    CheckpointExtraction,
    ExtractedLineItem,
)
from backend.models.agent_audit_log import AgentAuditLog
from backend.models.user import UserRole
from backend.services.secret_box import encrypt_secret

from .conftest import (
    as_business,
    as_owner,
    auth,
    make_business,
    make_client_row,
    make_user,
)

AGENT = "backend.services.checkpoint_extraction.run_checkpoint_extraction"
TRANSCRIBE = "backend.services.checkpoint_extraction.transcribe_audio"


def setup(db):
    biz = make_business(
        db, openai_api_key_enc=encrypt_secret("sk-" + "t" * 30)
    )
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    return user, make_client_row(db, "C")


def extraction() -> CheckpointExtraction:
    return CheckpointExtraction(
        meeting_minutes=["Wants a wardrobe"],
        line_items=[
            ExtractedLineItem(
                action="add",
                room="Master Bedroom",
                description="Wardrobe",
                unit="sqft",
                raw_dimension="8x7",
                qty=56,
            )
        ],
        client_budget=500000,
        unmapped_notes=["Likes teak"],
    )


def post(api, user, client, **kw):
    return api.post(
        f"/api/v1/clients/{client.id}/checkpoints/extract",
        headers=auth(user),
        **kw,
    )


def logs(db):
    as_owner(db)
    return list(db.scalars(select(AgentAuditLog)))


def test_pasted_text_returns_normalized_rows_and_logs_usage(api, db):
    user, client = setup(db)
    agent = AsyncMock(return_value=(extraction(), 120, 30))
    with patch(AGENT, agent):
        r = post(api, user, client, data={"text": "wardrobe 8x7 ft"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["transcript"] == "wardrobe 8x7 ft"
    assert body["meeting_minutes"] == ["Wants a wardrobe"]
    assert body["line_items"][0]["room"] == "Master Bedroom"
    assert body["client_budget"] == 500000
    assert body["unmapped_notes"] == ["Likes teak"]
    # Usage and cost are recorded for the admin, never sent to the user.
    assert not {
        "input_tokens",
        "output_tokens",
        "latency_ms",
        "cost_usd",
    } & set(body)
    [log] = logs(db)
    assert (log.input_tokens, log.output_tokens) == (120, 30)
    assert log.status == "success"
    assert str(log.id) == body["audit_log_id"]


def test_neither_file_nor_text_is_422(api, db):
    user, client = setup(db)
    with patch(AGENT, AsyncMock()) as agent:
        r = post(api, user, client)
    assert r.status_code == 422
    agent.assert_not_called()


def test_text_over_the_limit_is_413_and_never_reaches_the_agent(api, db):
    user, client = setup(db)
    with patch(AGENT, AsyncMock()) as agent:
        r = post(api, user, client, data={"text": "x" * 15_001})
    assert r.status_code == 413
    assert "15,000" in r.json()["detail"]
    agent.assert_not_called()


def test_text_at_the_limit_is_accepted(api, db):
    user, client = setup(db)
    agent = AsyncMock(return_value=(extraction(), 1, 1))
    with patch(AGENT, agent):
        r = post(api, user, client, data={"text": "x" * 15_000})
    assert r.status_code == 200, r.text


def test_utf8_text_file_is_read_as_the_transcript(api, db):
    user, client = setup(db)
    agent = AsyncMock(return_value=(extraction(), 1, 1))
    with patch(AGENT, agent):
        r = post(
            api,
            user,
            client,
            files={
                "file": ("n.txt", io.BytesIO("café ₹".encode()), "text/plain")
            },
        )
    assert r.status_code == 200, r.text
    assert agent.call_args.args[0] == "café ₹"


def test_non_utf8_text_file_falls_back_to_latin1(api, db):
    user, client = setup(db)
    agent = AsyncMock(return_value=(extraction(), 1, 1))
    with patch(AGENT, agent):
        r = post(
            api,
            user,
            client,
            files={
                "file": (
                    "n.txt",
                    io.BytesIO("café".encode("latin-1")),
                    "text/plain",
                )
            },
        )
    assert r.status_code == 200, r.text
    assert agent.call_args.args[0] == "café"


def test_audio_is_transcribed_before_extraction(api, db):
    user, client = setup(db)
    agent = AsyncMock(return_value=(extraction(), 1, 1))
    transcribe = AsyncMock(
        return_value=SimpleNamespace(text="spoken words", duration_seconds=12)
    )
    with patch(AGENT, agent), patch(TRANSCRIBE, transcribe):
        r = post(
            api,
            user,
            client,
            files={"file": ("m.mp3", io.BytesIO(b"abc"), "audio/mpeg")},
        )
    assert r.status_code == 200, r.text
    assert r.json()["transcript"] == "spoken words"
    assert agent.call_args.args[0] == "spoken words"
    assert {log.operation for log in logs(db)} >= {"audio_transcribe"}


def test_transcription_failure_is_502_and_logged(api, db):
    user, client = setup(db)
    transcribe = AsyncMock(side_effect=RuntimeError("whisper down"))
    with patch(AGENT, AsyncMock()) as agent, patch(TRANSCRIBE, transcribe):
        r = post(
            api,
            user,
            client,
            files={"file": ("m.mp3", io.BytesIO(b"abc"), "audio/mpeg")},
        )
    assert r.status_code == 502
    agent.assert_not_called()
    assert [log.status for log in logs(db)] == ["error"]


def test_agent_failure_is_502_without_leaking_the_error(api, db):
    user, client = setup(db)
    agent = AsyncMock(side_effect=ValueError("secret provider detail"))
    with patch(AGENT, agent):
        r = post(api, user, client, data={"text": "wardrobe"})
    assert r.status_code == 502
    assert "secret provider detail" not in r.text
    [log] = logs(db)
    assert log.status == "error"
