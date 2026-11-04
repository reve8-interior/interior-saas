"""
Text matching shared by every path that puts rows into a quotation.

Deterministic and LLM-free: the same two descriptions always score the same,
whichever source they came from.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher

from ..models.quotation_line_item import QuotationLineItem

# Similarity (0..1) above which two descriptions in the same room are
# considered the same work item. 0.72 tolerates rewording ("wardrobe with
# sliding doors" vs "sliding door wardrobe") without conflating distinct
# items ("wardrobe" vs "study table").
DESCRIPTION_MATCH_THRESHOLD = 0.72


def normalize_text(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _token_sort(text: str) -> str:
    return " ".join(sorted(normalize_text(text).split()))


def description_similarity(a: str, b: str) -> float:
    """Word-order-insensitive similarity between two descriptions."""
    norm_a, norm_b = _token_sort(a), _token_sort(b)
    if not norm_a or not norm_b:
        return 0.0
    if norm_a == norm_b:
        return 1.0
    return SequenceMatcher(None, norm_a, norm_b).ratio()


def find_matching_item(
    room: str,
    description: str,
    candidates: list[QuotationLineItem],
) -> QuotationLineItem | None:
    """Best existing item in the same room describing the same work.

    Returns None when nothing scores above DESCRIPTION_MATCH_THRESHOLD.
    """
    room_norm = normalize_text(room)
    best: QuotationLineItem | None = None
    best_score = 0.0
    for item in candidates:
        if normalize_text(item.room) != room_norm:
            continue
        score = description_similarity(item.description, description)
        if score > best_score:
            best, best_score = item, score
    if best is not None and best_score >= DESCRIPTION_MATCH_THRESHOLD:
        return best
    return None
