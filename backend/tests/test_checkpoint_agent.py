"""Unit tests for transcript chunking and merging in the extraction agent.

The OpenAI call is mocked: these pin how long pastes are split, how the
per-chunk results are combined, and that token usage is summed.
"""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from backend.agents import checkpoint_agent
from backend.agents.checkpoint_agent import (
    CHUNK_CHARS,
    CheckpointExtraction,
    ExtractedLineItem,
    _merge_extractions,
    _split_transcript,
    run_checkpoint_extraction,
)


def _extraction(
    minutes: list[str],
    items: list[str],
    budget: float | None = None,
    notes: list[str] | None = None,
) -> CheckpointExtraction:
    return CheckpointExtraction(
        meeting_minutes=minutes,
        line_items=[
            ExtractedLineItem(room="Kitchen", description=d) for d in items
        ],
        client_budget=budget,
        unmapped_notes=notes or [],
    )


def test_short_text_is_a_single_chunk() -> None:
    assert _split_transcript("hello\nworld") == ["hello\nworld"]


def test_long_text_splits_within_limit_and_loses_nothing() -> None:
    text = "".join(f"line {i}\n" for i in range(5000))
    chunks = _split_transcript(text, limit=1000)
    assert len(chunks) > 1
    assert all(len(c) <= 1000 for c in chunks)
    assert "".join(chunks) == text


def test_single_oversized_line_is_hard_split() -> None:
    text = "x" * 2500
    chunks = _split_transcript(text, limit=1000)
    assert [len(c) for c in chunks] == [1000, 1000, 500]
    assert "".join(chunks) == text


def test_empty_text_returns_one_chunk() -> None:
    assert _split_transcript("") == [""]


def test_merge_concatenates_and_takes_first_budget() -> None:
    merged = _merge_extractions(
        [
            _extraction(["a"], ["wardrobe"], None, ["n1"]),
            _extraction(["b"], ["tv unit"], 500000.0, ["n2"]),
            _extraction(["c"], [], 900000.0),
        ]
    )
    assert merged.meeting_minutes == ["a", "b", "c"]
    assert [li.description for li in merged.line_items] == [
        "wardrobe",
        "tv unit",
    ]
    assert merged.client_budget == 500000.0
    assert merged.unmapped_notes == ["n1", "n2"]


def test_run_extraction_chunks_merges_and_sums_tokens() -> None:
    text = ("x" * (CHUNK_CHARS - 10) + "\n") * 3
    results = [
        SimpleNamespace(
            output=_extraction([f"m{i}"], [f"item{i}"]),
            usage=lambda: SimpleNamespace(
                request_tokens=100, response_tokens=10
            ),
        )
        for i in range(3)
    ]
    run = AsyncMock(side_effect=results)

    with patch.object(checkpoint_agent.checkpoint_agent, "run", run):
        extraction, tokens_in, tokens_out = asyncio.run(
            run_checkpoint_extraction(text, api_key="sk-test")
        )

    assert run.await_count == 3
    assert [li.description for li in extraction.line_items] == [
        "item0",
        "item1",
        "item2",
    ]
    assert (tokens_in, tokens_out) == (300, 30)
    # Every call carries an explicit output cap.
    for call in run.await_args_list:
        assert call.kwargs["model_settings"]["max_tokens"] > 0
