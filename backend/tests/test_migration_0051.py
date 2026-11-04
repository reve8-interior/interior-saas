"""Migration 0051 backfills designs.business_id without deleting any row.

Runs the real Alembic chain against a throwaway database next to the test
database (the test role must be able to CREATE DATABASE, as in CI).
"""

import os
import subprocess
import sys
import uuid
from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url

from .conftest import TEST_DATABASE_URL

BACKEND = Path(__file__).resolve().parent.parent

BIZ = uuid.uuid4()
OWNED_CLIENT = uuid.uuid4()
ORPHAN_CLIENT = uuid.uuid4()
OWNED_DESIGN = uuid.uuid4()
ORPHAN_DESIGN = uuid.uuid4()


def _alembic(url: URL, *args: str) -> None:
    """Run alembic in a subprocess so its logging config stays out of pytest."""
    env = {
        **os.environ,
        "DATABASE_URL": url.render_as_string(hide_password=False),
    }
    subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND,
        env=env,
        check=True,
        capture_output=True,
    )


@pytest.fixture
def scratch_db() -> Generator[URL, None, None]:
    base = make_url(TEST_DATABASE_URL)
    name = f"mig0051_{uuid.uuid4().hex[:8]}"
    admin = create_engine(base, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    try:
        yield base.set(database=name)
    finally:
        with admin.connect() as conn:
            conn.execute(
                text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
            )
        admin.dispose()


def test_upgrade_keeps_design_of_businessless_client(scratch_db: URL):
    _alembic(scratch_db, "upgrade", "0050")
    engine = create_engine(scratch_db)
    try:
        with engine.begin() as conn:
            conn.execute(
                text("INSERT INTO businesses (id, name) VALUES (:b, 'B')"),
                {"b": BIZ},
            )
            conn.execute(
                text(
                    "INSERT INTO clients (id, name, business_id, contact_info)"
                    " VALUES (:c1, 'Owned', :b, '{}'),"
                    " (:c2, 'Orphan', NULL, '{}')"
                ),
                {"c1": OWNED_CLIENT, "c2": ORPHAN_CLIENT, "b": BIZ},
            )
            conn.execute(
                text(
                    "INSERT INTO designs (id, client_id, source, specs_json,"
                    " is_selected, rooms, in_portfolio) VALUES"
                    " (:d1, :c1, 'designer_uploaded', '{}', false, '[]', false),"
                    " (:d2, :c2, 'designer_uploaded', '{}', false, '[]', false)"
                ),
                {
                    "d1": OWNED_DESIGN,
                    "c1": OWNED_CLIENT,
                    "d2": ORPHAN_DESIGN,
                    "c2": ORPHAN_CLIENT,
                },
            )

        _alembic(scratch_db, "upgrade", "0051")

        with engine.connect() as conn:
            rows = dict(
                conn.execute(text("SELECT id, business_id FROM designs")).all()
            )
        assert rows == {OWNED_DESIGN: BIZ, ORPHAN_DESIGN: None}
    finally:
        engine.dispose()
