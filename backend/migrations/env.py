"""Alembic migration environment.

Reads DATABASE_URL from backend.core.config so the connection string
lives in one place (.env / environment variables).
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from dotenv import dotenv_values
from sqlalchemy import engine_from_config, pool

# ---------------------------------------------------------------------------
# Make the *backend* package importable.
# When running `cd backend && alembic upgrade head`, the CWD is backend/
# but we need `import backend.models` to resolve relative imports.
# So we add the repo root (parent of backend/) to sys.path.
# ---------------------------------------------------------------------------
_backend_dir = Path(__file__).resolve().parents[1]  # …/backend
_repo_root = _backend_dir.parent  # …/interior-designer-portal
sys.path.insert(0, str(_repo_root))

# Import ALL models so Base.metadata knows every table
from backend.models import Base  # noqa: E402, F401

# Alembic Config object (provides access to alembic.ini values)
config = context.config

# ---------------------------------------------------------------------------
# Support: alembic -x env=prod|dev upgrade head
# Must load the env file BEFORE instantiating Settings, because the singleton
# in core.config is already built — we construct a fresh one here instead.
# ---------------------------------------------------------------------------
_target = context.get_x_argument(as_dictionary=True).get("env", "dev")
_env_file = _backend_dir / f".env.{_target}"

# Prefer DATABASE_URL from the process environment (set by Docker/CI/test
# fixtures), fall back to reading from the .env file for local alembic runs.

_db_url = os.environ.get("DATABASE_URL") or dotenv_values(_env_file).get(
    "DATABASE_URL", ""
)
if not _db_url:
    raise RuntimeError(f"DATABASE_URL not found in environment or {_env_file}")
config.set_main_option("sqlalchemy.url", _db_url)

# Python logging config from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# MetaData object for autogenerate support
target_metadata = Base.metadata

# ---------------------------------------------------------------------------
# Tables that exist in the DB but are NOT managed by our SQLAlchemy models.
# Alembic autogenerate will ignore these instead of trying to drop them.
# Remove a name from this set once you add a corresponding model.
# ---------------------------------------------------------------------------
_EXCLUDE_TABLES: set[str] = set()


def include_name(name: str | None, type_: str, parent_names: dict) -> bool:
    """Filter callback for autogenerate — skip orphaned tables."""
    if type_ == "table" and name in _EXCLUDE_TABLES:
        return False
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — emits SQL to stdout."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_name=include_name,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode — connects to the database."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_name=include_name,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
