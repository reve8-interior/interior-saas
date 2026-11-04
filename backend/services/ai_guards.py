"""
Guards around AI inputs and outputs.

Guards flag, they never silently change anything: a flagged run is still
shown to the designer, with the reason, and the flags are stored on the
audit row so risky runs can be counted and reviewed later.

Pure functions over duck-typed items — no LLM, no DB.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from statistics import median
from typing import Literal, Protocol, Sequence

Severity = Literal["warn", "high"]

# A rate this many times above/below the quotation's own median rate for
# the same unit is probably a slipped decimal or a misheard number.
RATE_OUTLIER_FACTOR = 5
MIN_RATE_SAMPLES = 3
# A single row above this is checked by a human before it is trusted.
LARGE_ROW_AMOUNT = 1_000_000

_INJECTION_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r"ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above)\s+"
        r"(instructions|rules|prompts?)",
        r"disregard\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|system)",
        r"(reveal|show|print)\s+(your\s+|the\s+)?system\s+prompt",
        r"you\s+are\s+now\s+(a|an|in)\b",
        r"set\s+(all\s+|every\s+)?(the\s+)?(prices?|rates?|amounts?)\s+to\s+"
        r"(0|zero|nothing)\b",
    )
]

_WORD = re.compile(r"[a-z]{4,}")


@dataclass(frozen=True)
class GuardFlag:
    code: str
    severity: Severity
    message: str

    def to_dict(self) -> dict[str, str]:
        return asdict(self)


class PricedItem(Protocol):
    action: str
    room: str
    description: str
    unit: str | None
    qty: float | None
    rate: float | None


def scan_input(text: str) -> list[GuardFlag]:
    """Flag text that tries to instruct the model instead of describing work."""
    if any(p.search(text) for p in _INJECTION_PATTERNS):
        return [
            GuardFlag(
                "prompt_injection",
                "high",
                "The notes contain text that looks like instructions to the "
                "AI. Check every extracted row carefully.",
            )
        ]
    return []


def median_rates_by_unit(
    items: Sequence[PricedItem],
) -> dict[str, float]:
    """Median rate per unit, only for units with enough samples."""
    by_unit: dict[str, list[float]] = {}
    for it in items:
        if it.rate and it.rate > 0 and it.unit:
            by_unit.setdefault(it.unit, []).append(float(it.rate))
    return {
        unit: median(rates)
        for unit, rates in by_unit.items()
        if len(rates) >= MIN_RATE_SAMPLES
    }


def rate_outlier_message(
    item: PricedItem, medians: dict[str, float]
) -> str | None:
    """Why this item's rate is far from the quotation's own, else None."""
    if not item.rate or item.rate <= 0 or not item.unit:
        return None
    ref = medians.get(item.unit)
    if not ref:
        return None
    if item.rate > ref * RATE_OUTLIER_FACTOR or item.rate < ref / (
        RATE_OUTLIER_FACTOR
    ):
        return (
            f"₹{item.rate:,.0f}/{item.unit} is far from this quotation's "
            f"typical ₹{ref:,.0f}/{item.unit}."
        )
    return None


def _grounded(description: str, transcript: str) -> bool:
    """True when at least one meaningful word of the row is in the notes."""
    words = set(_WORD.findall(description.lower()))
    if not words:
        return True
    haystack = transcript.lower()
    return any(w in haystack for w in words)


def check_extracted_items(
    items: Sequence[PricedItem],
    *,
    transcript: str,
    existing: Sequence[PricedItem] = (),
) -> list[GuardFlag]:
    """Sanity-check what the extractor proposed, before a human sees it."""
    flags: list[GuardFlag] = []
    medians = median_rates_by_unit(existing)
    for it in items:
        if it.action == "remove":
            continue
        label = f"{it.room} — {it.description}"
        if (it.qty is not None and it.qty <= 0) or (
            it.rate is not None and it.rate <= 0
        ):
            flags.append(
                GuardFlag(
                    "non_positive_amount",
                    "high",
                    f"{label}: quantity or rate is zero or negative.",
                )
            )
        if (
            it.qty
            and it.rate
            and it.qty > 0
            and it.rate > 0
            and it.qty * it.rate > LARGE_ROW_AMOUNT
        ):
            flags.append(
                GuardFlag(
                    "large_amount",
                    "warn",
                    f"{label}: row total is above ₹{LARGE_ROW_AMOUNT:,}.",
                )
            )
        outlier = rate_outlier_message(it, medians)
        if outlier:
            flags.append(
                GuardFlag("rate_outlier", "warn", f"{label}: {outlier}")
            )
        if it.action == "add" and not _grounded(it.description, transcript):
            flags.append(
                GuardFlag(
                    "ungrounded_item",
                    "warn",
                    f"{label}: nothing like this appears in the notes.",
                )
            )
    return flags
