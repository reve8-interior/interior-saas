"""
Pre-send review of a quotation: the checks a careful colleague would do.

Rule-based and deterministic — no LLM call, no credits. Each rule is a
small function over the live items returning findings; add a rule by
writing one function and listing it in RULES.
"""

from __future__ import annotations

from typing import Callable, Sequence

from ..models.quotation_line_item import (
    QuotationItemStatus,
    QuotationLineItem,
)
from ..schemas.quotation_review import QuotationReview, ReviewFinding
from .ai_guards import median_rates_by_unit, rate_outlier_message
from .checkpoint_merge import (
    DESCRIPTION_MATCH_THRESHOLD,
    description_similarity,
)

Rule = Callable[[Sequence[QuotationLineItem]], list[ReviewFinding]]

# trigger word in a room's items -> (words that should also appear, advice)
_COMPANIONS: tuple[tuple[str, tuple[str, ...], str], ...] = (
    (
        "wardrobe",
        ("hardware", "handle", "channel", "hinge", "soft close"),
        "has a wardrobe but no hardware or handles line",
    ),
    (
        "kitchen",
        ("countertop", "counter top", "granite", "quartz", "slab"),
        "has kitchen cabinets but no countertop line",
    ),
    (
        "false ceiling",
        ("light", "cove", "electrical", "profile"),
        "has a false ceiling but no lighting or electrical line",
    ),
)


def _live(items: Sequence[QuotationLineItem]) -> list[QuotationLineItem]:
    return [i for i in items if i.status != QuotationItemStatus.removed]


def _label(item: QuotationLineItem) -> str:
    return f"{item.room} — {item.description}"


def _missing_price(
    items: Sequence[QuotationLineItem],
) -> list[ReviewFinding]:
    return [
        ReviewFinding(
            code="missing_price",
            severity="error",
            message=f"{_label(i)}: no price yet.",
            room=i.room,
            item_id=str(i.id),
        )
        for i in _live(items)
        if i.initial_price is None and i.negotiated_price is None
    ]


def _unclear(items: Sequence[QuotationLineItem]) -> list[ReviewFinding]:
    return [
        ReviewFinding(
            code="needs_clarity",
            severity="warning",
            message=f"{_label(i)}: marked as unclear (check the dimension).",
            room=i.room,
            item_id=str(i.id),
        )
        for i in _live(items)
        if i.status == QuotationItemStatus.pending_clarity
    ]


def _duplicates(items: Sequence[QuotationLineItem]) -> list[ReviewFinding]:
    findings: list[ReviewFinding] = []
    live = _live(items)
    for n, a in enumerate(live):
        for b in live[n + 1 :]:
            if (
                a.room.strip().lower() == b.room.strip().lower()
                and description_similarity(a.description, b.description)
                >= DESCRIPTION_MATCH_THRESHOLD
            ):
                findings.append(
                    ReviewFinding(
                        code="possible_duplicate",
                        severity="warning",
                        message=(
                            f"{_label(a)} looks like a duplicate of "
                            f"“{b.description}”."
                        ),
                        room=a.room,
                        item_id=str(b.id),
                    )
                )
    return findings


def _rate_outliers(
    items: Sequence[QuotationLineItem],
) -> list[ReviewFinding]:
    live = _live(items)
    medians = median_rates_by_unit(live)
    findings: list[ReviewFinding] = []
    for i in live:
        msg = rate_outlier_message(i, medians)
        if msg:
            findings.append(
                ReviewFinding(
                    code="rate_outlier",
                    severity="warning",
                    message=f"{_label(i)}: {msg}",
                    room=i.room,
                    item_id=str(i.id),
                )
            )
    return findings


def _missing_companions(
    items: Sequence[QuotationLineItem],
) -> list[ReviewFinding]:
    by_room: dict[str, list[QuotationLineItem]] = {}
    for i in _live(items):
        by_room.setdefault(i.room, []).append(i)
    findings: list[ReviewFinding] = []
    for room, room_items in by_room.items():
        text = " ".join(f"{room} {i.description}".lower() for i in room_items)
        for trigger, expected, advice in _COMPANIONS:
            if trigger in text and not any(w in text for w in expected):
                findings.append(
                    ReviewFinding(
                        code="possible_missing_item",
                        severity="info",
                        message=f"{room} {advice}. Intentional?",
                        room=room,
                    )
                )
    return findings


RULES: tuple[Rule, ...] = (
    _missing_price,
    _unclear,
    _duplicates,
    _rate_outliers,
    _missing_companions,
)

_ORDER = {"error": 0, "warning": 1, "info": 2}


def review_quotation(items: Sequence[QuotationLineItem]) -> QuotationReview:
    """Run every rule and return findings, most serious first."""
    findings = [f for rule in RULES for f in rule(items)]
    if not _live(items):
        findings.append(
            ReviewFinding(
                code="empty_quotation",
                severity="error",
                message="The quotation has no items.",
            )
        )
    findings.sort(key=lambda f: _ORDER[f.severity])
    return QuotationReview(findings=findings, items_checked=len(_live(items)))
