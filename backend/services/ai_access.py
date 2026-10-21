"""Per-business OpenAI key resolution and AI usage logging."""

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.agent_audit_log import AgentAuditLog
from ..models.user import User
from .ai_models import DEFAULT_TIER, ModelTier, tier_model
from .ai_pricing import call_cost
from .secret_box import decrypt_secret

# Used when a business hasn't picked a model on the admin page.
DEFAULT_WHISPER_MODEL = "whisper-1"

OP_CHECKPOINT_EXTRACT = "checkpoint_extract"
OP_AUDIO_TRANSCRIBE = "audio_transcribe"
OP_MATERIALS_EXTRACT = "materials_extract"


@dataclass(frozen=True)
class OpenAIAccess:
    api_key: str
    model: str
    whisper_model: str


def resolve_chat_model(user: User, tier: ModelTier | None = None) -> str:
    """The model behind the requested tier (default tier when omitted)."""
    return tier_model(user.business, tier or DEFAULT_TIER)


def resolve_whisper_model(user: User) -> str:
    """The business's chosen transcription model, or the platform default."""
    business = user.business
    return (
        business.openai_whisper_model if business else None
    ) or DEFAULT_WHISPER_MODEL


def resolve_openai_access(
    user: User, tier: ModelTier | None = None
) -> OpenAIAccess:
    """The user's business OpenAI key and the model for the chosen tier.

    Raises 503 when the business has no key (or none that can be decrypted).
    """
    business = user.business
    if business and business.openai_api_key_enc:
        key = decrypt_secret(business.openai_api_key_enc)
        if key:
            return OpenAIAccess(
                api_key=key,
                model=resolve_chat_model(user, tier),
                whisper_model=resolve_whisper_model(user),
            )
        raise HTTPException(
            status_code=503,
            detail="AI operations need to be set up again for your business. Please ask your admin to re-add them.",
        )
    raise HTTPException(
        status_code=503,
        detail="AI operations aren't set up for your business yet. Please ask your admin to add them.",
    )


def log_ai_usage(
    db: Session,
    *,
    operation: str,
    model: str,
    latency_ms: int,
    status: str,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    audio_seconds: float | None = None,
    client_id: uuid.UUID | None = None,
    raw_input_hash: str | None = None,
) -> AgentAuditLog:
    """Record one AI call. business_id is filled from the request scope."""
    log = AgentAuditLog(
        id=uuid.uuid4(),
        client_id=client_id,
        operation=operation,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        cost_usd=call_cost(
            model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            audio_seconds=audio_seconds,
        ),
        status=status,
        raw_input_hash=raw_input_hash,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
