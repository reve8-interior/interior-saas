"""
PydanticAI agent that reads rooms and dimensions off a floor-plan image.

The model only reads. Which line items a room gets, and every quantity
and rate, are decided afterwards by services.floorplan_draft.
"""

from __future__ import annotations

from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from pydantic_ai import Agent, BinaryContent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from .prompts.floorplan_extraction import FLOORPLAN_PROMPT_VERSION, PROMPTS


class FloorPlanRoom(BaseModel):
    name: str = Field(description="Room name, e.g. 'Master Bedroom'")
    length_ft: float | None = Field(
        default=None, description="Printed length in decimal feet, else null"
    )
    width_ft: float | None = Field(
        default=None, description="Printed width in decimal feet, else null"
    )
    notes: str | None = Field(
        default=None, description="Anything uncertain about this room"
    )


class FloorPlanExtraction(BaseModel):
    rooms: list[FloorPlanRoom] = Field(default_factory=list)
    unreadable: bool = Field(
        default=False, description="True if this is not a readable floor plan"
    )


MAX_OUTPUT_TOKENS = 3000
REQUEST_TIMEOUT_S = 120.0
API_MAX_RETRIES = 3

floorplan_agent: Agent[None, FloorPlanExtraction] = Agent(
    output_type=FloorPlanExtraction,
    system_prompt=PROMPTS[FLOORPLAN_PROMPT_VERSION],
)


async def run_floorplan_extraction(
    image: bytes,
    media_type: str,
    api_key: str,
    model: str = "openai:gpt-4.1-mini",
) -> tuple[FloorPlanExtraction, int, int]:
    """Read one floor-plan image. Returns (extraction, in_tokens, out_tokens)."""
    client = AsyncOpenAI(
        api_key=api_key,
        timeout=REQUEST_TIMEOUT_S,
        max_retries=API_MAX_RETRIES,
    )
    llm = OpenAIChatModel(
        model.removeprefix("openai:"),
        provider=OpenAIProvider(openai_client=client),
    )
    result = await floorplan_agent.run(
        [
            "Read the rooms and dimensions from this floor plan.",
            BinaryContent(data=image, media_type=media_type),
        ],
        model=llm,
        model_settings={"max_tokens": MAX_OUTPUT_TOKENS},
    )
    usage = result.usage() if callable(result.usage) else result.usage
    return (
        result.output,
        getattr(usage, "request_tokens", None)
        or getattr(usage, "input_tokens", None)
        or 0,
        getattr(usage, "response_tokens", None)
        or getattr(usage, "output_tokens", None)
        or 0,
    )
