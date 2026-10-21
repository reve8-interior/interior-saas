"""
PydanticAI agent that extracts meeting minutes and quotation line items
from a client meeting transcript.

A meeting is a *delta* on the quotation, not a restatement of it: the
client says "make the kids wardrobe 6 feet instead" or "drop the tulasi
base". The agent therefore emits an action per item (add / update /
remove) plus the ref of the existing item it refers to, taken from the
input-scoped context that services.quotation_context builds. Resolving
refs to real line-item ids, snapping room names and normalising units
all happen deterministically afterwards in
services.extraction_postprocess — the model's only job is reading the
conversation.
"""

from __future__ import annotations

from typing import Literal

from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from ..services.quotation_context import ScopeContext, render_scope_context
from .prompts.checkpoint_extraction import (
    CHECKPOINT_PROMPT_VERSION,
    PROMPTS,
)

# ── Output schemas ───────────────────────────────────────────────────────────

ItemAction = Literal["add", "update", "remove"]


class ExtractedLineItem(BaseModel):
    action: ItemAction = Field(
        default="add",
        description=(
            "add = work not on the quotation yet. update = a change to an "
            "existing item listed in CURRENT QUOTATION. remove = the "
            "client dropped an existing item."
        ),
    )
    target_ref: str | None = Field(
        default=None,
        description=(
            "For update/remove: the ref (E1, E2 …) of the existing item "
            "from CURRENT QUOTATION. Null for add. Never invent a ref."
        ),
    )
    room: str = Field(description="Room name, e.g. 'Master Bedroom'")
    description: str = Field(
        description="Work description, e.g. 'Wardrobe with sliding doors'"
    )
    unit: str | None = Field(
        default=None,
        description=(
            "Unit of measurement if stated or obvious: sqft, rft, nos, "
            "sets, lumpsum. Null when the transcript gives no basis for "
            "one — a human fills it in."
        ),
    )
    raw_dimension: str | None = Field(
        default=None,
        description="Dimension string as spoken, e.g. '6x8 feet'",
    )
    qty: float | None = Field(
        default=None, description="Quantity if stated explicitly"
    )
    rate: float | None = Field(
        default=None, description="Rate per unit in INR if mentioned"
    )
    est_time: str | None = Field(
        default=None,
        description=(
            "Estimated time to complete this work if mentioned, kept "
            "verbatim, e.g. '2 weeks', '10 days'"
        ),
    )
    remarks: str | None = Field(
        default=None, description="Clarifications, client preferences"
    )


class CheckpointExtraction(BaseModel):
    meeting_minutes: list[str] = Field(
        description=(
            "Bullet-point summary of the meeting. Each element is one bullet."
        )
    )
    line_items: list[ExtractedLineItem] = Field(
        description="All work items discussed that could become quotation "
        "line items."
    )
    client_budget: float | None = Field(
        default=None,
        description="Total budget mentioned by the client in INR, if any.",
    )
    unmapped_notes: list[str] = Field(
        default_factory=list,
        description=(
            "Statements that affect the project but could not be turned "
            "into a line item — an unresolved question, a preference with "
            "no item to attach it to, a decision to revisit later. Never "
            "silently drop scope-relevant content."
        ),
    )


# ── System prompt ───────────────────────────────────────────────────────────

_SYSTEM_PROMPT = PROMPTS[CHECKPOINT_PROMPT_VERSION]


# ── Agent definition ─────────────────────────────────────────────────────────

# No model here: each run supplies one built from the caller's business key.
checkpoint_agent: Agent[None, CheckpointExtraction] = Agent(
    output_type=CheckpointExtraction,
    system_prompt=_SYSTEM_PROMPT,
)


# A long paste produces a long structured answer; without a cap and a
# chunk size the reply can be cut off mid-JSON and fail validation.
MAX_OUTPUT_TOKENS = 8000
REQUEST_TIMEOUT_S = 120.0
API_MAX_RETRIES = 3
CHUNK_CHARS = 12000


def _split_transcript(text: str, limit: int = CHUNK_CHARS) -> list[str]:
    """Split on line breaks into chunks of at most `limit` characters.

    A single line longer than `limit` is hard-split so no chunk exceeds it.
    """
    chunks: list[str] = []
    current = ""
    for line in text.splitlines(keepends=True):
        while len(line) > limit:
            if current:
                chunks.append(current)
                current = ""
            chunks.append(line[:limit])
            line = line[limit:]
        if len(current) + len(line) > limit and current:
            chunks.append(current)
            current = ""
        current += line
    if current.strip():
        chunks.append(current)
    return chunks or [text]


def _merge_extractions(
    parts: list[CheckpointExtraction],
) -> CheckpointExtraction:
    """Combine per-chunk results; duplicates are folded downstream."""
    return CheckpointExtraction(
        meeting_minutes=[m for p in parts for m in p.meeting_minutes],
        line_items=[li for p in parts for li in p.line_items],
        client_budget=next(
            (p.client_budget for p in parts if p.client_budget is not None),
            None,
        ),
        unmapped_notes=[n for p in parts for n in p.unmapped_notes],
    )


async def run_checkpoint_extraction(
    text: str,
    api_key: str,
    model: str = "openai:gpt-4.1-mini",
    scope: ScopeContext | None = None,
) -> tuple[CheckpointExtraction, int, int]:
    """Run the agent on a transcript string.

    scope — the input-scoped slice of the client's existing quotation
    (services.quotation_context.build_scope_context). Rendered ahead of
    the transcript so the agent can anchor updates and removals onto
    real items by ref instead of re-describing them.

    Long transcripts are processed in chunks and merged.

    Returns (extraction, input_tokens, output_tokens).
    """
    preamble = render_scope_context(scope) if scope is not None else ""
    # The key belongs to the caller's business, so build the model per call.
    name = model.removeprefix("openai:")
    client = AsyncOpenAI(
        api_key=api_key,
        timeout=REQUEST_TIMEOUT_S,
        max_retries=API_MAX_RETRIES,
    )
    llm = OpenAIChatModel(name, provider=OpenAIProvider(openai_client=client))

    parts: list[CheckpointExtraction] = []
    input_tokens = 0
    output_tokens = 0
    for chunk in _split_transcript(text):
        result = await checkpoint_agent.run(
            (preamble or "") + chunk,
            model=llm,
            model_settings={"max_tokens": MAX_OUTPUT_TOKENS},
        )
        usage = result.usage() if callable(result.usage) else result.usage
        input_tokens += (
            getattr(usage, "request_tokens", None)
            or getattr(usage, "input_tokens", None)
            or 0
        )
        output_tokens += (
            getattr(usage, "response_tokens", None)
            or getattr(usage, "output_tokens", None)
            or 0
        )
        parts.append(result.output)
    return _merge_extractions(parts), input_tokens, output_tokens
