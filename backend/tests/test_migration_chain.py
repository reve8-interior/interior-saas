"""The Alembic revision files form one linear chain with a single head."""

import ast
from pathlib import Path

VERSIONS = Path(__file__).resolve().parent.parent / "migrations" / "versions"


def _revisions() -> dict[str, str | None]:
    """Map each revision id to its down_revision, read from the files."""
    found: dict[str, str | None] = {}
    for path in sorted(VERSIONS.glob("*.py")):
        values: dict[str, str | None] = {}
        for node in ast.parse(path.read_text(encoding="utf-8")).body:
            if isinstance(node, ast.Assign) and isinstance(
                node.value, ast.Constant
            ):
                for target in node.targets:
                    if getattr(target, "id", "") in (
                        "revision",
                        "down_revision",
                    ):
                        values[target.id] = node.value.value
        revision = values["revision"]
        assert revision not in found, f"{revision} is used by two files"
        found[revision] = values.get("down_revision")
    return found


def test_revision_ids_are_unique_and_every_parent_exists():
    revisions = _revisions()
    for revision, parent in revisions.items():
        assert parent is None or parent in revisions, (
            f"{revision} points at missing {parent}"
        )


def test_no_two_revisions_share_a_parent():
    parents = [p for p in _revisions().values() if p is not None]
    assert len(parents) == len(set(parents)), "migration history branches"


def test_there_is_exactly_one_head():
    revisions = _revisions()
    heads = set(revisions) - {p for p in revisions.values() if p}
    assert len(heads) == 1, f"multiple heads: {sorted(heads)}"
