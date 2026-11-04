"""Keeps every route that creates quotation lines behind the intake gate.

A new source that builds a `QuotationLineItem` without going through
`services/intake_gate.py` would reintroduce per-source behaviour. This test
fails when one appears, so the author must either use the gate or say, here,
why the file is not an intake source.
"""

from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent

# Files that build lines from incoming rows: each must call the gate.
GATED = {
    "routers/quotations.py",
    "services/checkpoint_merge.py",
    "services/design_quotation.py",
}

# Files that build lines for reasons other than intake, with the reason.
NOT_INTAKE = {
    "models/quotation_line_item.py": "the model itself",
    "seed_demo.py": "demo data",
    "services/sample_client.py": "sample client seed data",
    "services/quotation_version.py": "restores a saved version verbatim",
    "services/checkpoint_ai_support.py": "restores an undo snapshot verbatim",
}


def constructors() -> set[str]:
    found = set()
    for path in BACKEND.rglob("*.py"):
        relative = path.relative_to(BACKEND).as_posix()
        if relative.startswith(("tests/", ".venv/", "migrations/")):
            continue
        if "QuotationLineItem(" in path.read_text(encoding="utf-8"):
            found.add(relative)
    return found


def test_every_line_constructor_is_gated_or_explained():
    unknown = constructors() - GATED - set(NOT_INTAKE)
    assert not unknown, (
        f"{sorted(unknown)} build QuotationLineItem rows: route them through "
        "services/intake_gate.decide, or list them in NOT_INTAKE with a reason"
    )


def test_gated_files_really_call_the_gate():
    for relative in GATED:
        source = (BACKEND / relative).read_text(encoding="utf-8")
        assert "intake_gate" in source and "decide(" in source, relative


def test_the_lists_do_not_go_stale():
    missing = (GATED | set(NOT_INTAKE)) - constructors()
    # The model file defines the class; the others must still construct it.
    assert missing <= {"models/quotation_line_item.py"}, sorted(missing)
