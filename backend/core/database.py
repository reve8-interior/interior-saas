from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import Session, sessionmaker

from .. import models  # noqa: F401 - needed to register models
from ..models.base import Base
from .config import settings
from .logging import logger
from ..rls import apply_rls, scope_connection

engine = create_engine(
    settings.database_url,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_pre_ping=settings.db_pool_pre_ping,
    pool_recycle=settings.db_pool_recycle,
    connect_args={"connect_timeout": settings.db_connect_timeout},
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


@event.listens_for(Session, "after_begin")
def _scope_transaction(session, transaction, connection) -> None:
    """Re-apply the business scope at the start of every transaction.

    SET LOCAL lasts one transaction, and handlers commit mid-request, so the
    scope is kept in session.info and restored each time a new one begins.
    """
    if session.info.get("scoped"):
        scope_connection(connection, session.info.get("business_id"))


def scope_session(session: Session, business_id) -> None:
    """Confine a session to one business's rows (Postgres RLS)."""
    session.info["scoped"] = True
    session.info["business_id"] = business_id
    scope_connection(session.connection(), business_id)


def get_db() -> Generator[Session, None, None]:
    """Yield a SQLAlchemy session for dependency injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _stamp_alembic_head() -> None:
    """Record the latest Alembic revision without running any migrations.

    create_all() builds the current schema directly, so the migrations that
    produced it must be marked as already applied. Otherwise the next
    `alembic upgrade head` replays them against columns that already exist.
    """

    from alembic.config import Config
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory

    backend_dir = Path(__file__).resolve().parents[1]
    alembic_cfg = Config(str(backend_dir / "alembic.ini"))
    # script_location in alembic.ini is relative to the CWD of the alembic
    # CLI; resolve it here so init_db() works from any working directory.
    alembic_cfg.set_main_option(
        "script_location", str(backend_dir / "migrations")
    )
    script = ScriptDirectory.from_config(alembic_cfg)

    with engine.begin() as conn:
        MigrationContext.configure(conn).stamp(script, "head")


def init_db() -> None:
    """Create database tables if they do not exist.

    For new deployments this creates all tables via metadata.create_all()
    and then stamps the current Alembic head, so the fresh schema is already
    at head rather than un-versioned. Schema changes after the initial
    creation should be managed exclusively through Alembic migrations —
    see docs/ALEMBIC.md for usage.
    """

    was_empty = not inspect(engine).get_table_names()

    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        apply_rls(conn)

    # Only stamp a database we just created from scratch. An existing schema
    # is left alone: stamping it could mask real drift by declaring migrations
    # applied that never ran against it.
    if was_empty:
        try:
            _stamp_alembic_head()
            logger.info("alembic_version_stamped_head")
        except Exception as exc:
            # The schema itself is already in place; an un-stamped
            # alembic_version can be fixed with `alembic stamp head`.
            logger.warning("alembic_stamp_failed", error=str(exc))
