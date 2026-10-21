"""
Deterministic parser for unstructured quotation dimension strings.

Real quotations express dimensions as feet/inches strings such as
``5'x3'``, ``6'3"x1'6"`` or ``11'x7'.5"``. LLMs must never do this
string-to-math conversion; this module is the single source of truth.
Unparseable input returns ``None`` so callers can flag the line item
for human review instead of guessing.
"""

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

_INCHES_PER_FOOT = Decimal("12")
_SQFT_PRECISION = Decimal("0.01")

# One side of a dimension: optional feet (e.g. 6') plus optional inches
# (e.g. 3" or .5"). A bare number with no marker is treated as feet.
_SIDE_RE = re.compile(
    r"""^\s*
    (?:(?P<feet>\d+(?:\.\d+)?)\s*['’])?          # feet: 6'
    \s*
    (?:(?P<inches>\d*\.?\d+)\s*(?:"|”|''))?      # inches: 3" or .5"
    \s*$""",
    re.VERBOSE,
)
_BARE_NUMBER_RE = re.compile(r"^\s*(?P<feet>\d+(?:\.\d+)?)\s*$")
_SEPARATOR_RE = re.compile(r"[x×*]", re.IGNORECASE)

_UNIT_ALIASES: dict[str, str] = {
    "sqft": "sqft",
    "sft": "sqft",
    "sq.ft": "sqft",
    "sq ft": "sqft",
    "nos": "nos",
    "no's": "nos",
    "no": "nos",
    "count": "nos",
    "rft": "rft",
    "r.ft": "rft",
    "dimension": "dimension",
    "dimensions": "dimension",
    "lumpsum": "lumpsum",
    "ls": "lumpsum",
}


@dataclass(frozen=True)
class ParsedDimension:
    """A dimension string resolved to numeric feet and square footage."""

    raw: str
    width_ft: Decimal
    height_ft: Decimal
    sqft: Decimal


def normalize_unit(raw: str | None) -> str:
    """Map messy unit spellings (``Sqft``, ``no's``, ``Count``) to a
    canonical lowercase token. Unknown units pass through lowercased;
    a missing unit normalizes to the empty string rather than raising —
    the agent is allowed to leave it for a human to fill in."""
    key = (raw or "").strip().lower()
    return _UNIT_ALIASES.get(key, key)


def _parse_side(side: str) -> Decimal | None:
    """Parse one side (``6'3"``, ``.5"``, ``10``) to decimal feet."""
    bare = _BARE_NUMBER_RE.match(side)
    if bare:
        return Decimal(bare.group("feet"))

    match = _SIDE_RE.match(side)
    if not match or (not match.group("feet") and not match.group("inches")):
        return None

    feet = Decimal(match.group("feet") or "0")
    inches = Decimal(match.group("inches") or "0")
    return feet + inches / _INCHES_PER_FOOT


def parse_dimension(raw: str) -> ParsedDimension | None:
    """
    Parse a two-sided dimension string into square footage.

    Returns ``None`` for anything that is not unambiguously
    ``<side> x <side>`` — callers must treat that as "needs review",
    never as zero.
    """
    if not raw or not raw.strip():
        return None

    sides = _SEPARATOR_RE.split(raw.strip())
    if len(sides) != 2:
        return None

    width_ft = _parse_side(sides[0])
    height_ft = _parse_side(sides[1])
    if width_ft is None or height_ft is None:
        return None

    sqft = (width_ft * height_ft).quantize(
        _SQFT_PRECISION, rounding=ROUND_HALF_UP
    )
    return ParsedDimension(
        raw=raw.strip(), width_ft=width_ft, height_ft=height_ft, sqft=sqft
    )
