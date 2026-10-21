"""Shared fixtures: a throwaway Postgres schema with RLS, and test helpers.

Tests need a real Postgres (RLS and enums are Postgres features). Point
TEST_DATABASE_URL at a *disposable* database — the schema is dropped and
recreated. The role must be able to CREATE ROLE (superuser in CI).
"""

import os
import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from backend import (
    models,  # noqa: F401  # registers every table on Base.metadata
)
from backend.core import get_db
from backend.core.database import scope_session
from backend.core.security import create_access_token, get_password_hash
from backend.main import app
from backend.models.base import Base
from backend.models.business import Business
from backend.models.client import Client
from backend.models.user import User, UserRole
from backend.rls import apply_rls

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://reve8:reve8@localhost:5433/reve8",
)

engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
TestSession = sessionmaker(
    bind=engine, autocommit=False, autoflush=False, expire_on_commit=False
)

PASSWORD = "correct-horse-1"


@pytest.fixture(scope="session")
def tables() -> Generator[None, None, None]:
    """Create the schema (plus RLS policies) once for the test session."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        apply_rls(conn)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db(tables: None) -> Generator[Session, None, None]:
    """One transaction per test, always rolled back — no cross-test leakage."""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestSession(bind=connection)
    yield session
    transaction.rollback()
    session.close()
    connection.close()


def as_business(db: Session, business_id: uuid.UUID | None) -> None:
    """Confine the session to one business, exactly as a request would."""
    db.flush()
    scope_session(db, business_id)


def as_owner(db: Session) -> None:
    """Back to the unrestricted owner role (what the superadmin runs as)."""
    db.flush()
    db.info["scoped"] = False
    db.execute(text("RESET ROLE"))
    # A fresh superadmin request never carries a business scope.
    db.execute(text("SELECT set_config('app.business_id', '', true)"))


@pytest.fixture
def api(db: Session) -> Generator[TestClient, None, None]:
    """TestClient whose requests share the per-test transaction.

    The app's lifespan (init_db/bootstrap) is skipped by not using the
    context manager, so nothing touches the dev database.
    """

    def request_session() -> Session:
        # Production opens a fresh unscoped session per request; the shared
        # one must not carry the previous request's business scope.
        as_owner(db)
        return db

    app.dependency_overrides[get_db] = request_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def make_business(db: Session, name: str | None = None, **kw) -> Business:
    business = Business(name=name or f"Biz {uuid.uuid4().hex[:8]}", **kw)
    db.add(business)
    db.flush()
    return business


def make_user(
    db: Session,
    *,
    role: UserRole = UserRole.designer,
    business: Business | None = None,
    email: str | None = None,
    password: str = PASSWORD,
    **kw,
) -> User:
    user = User(
        email=email or f"{uuid.uuid4().hex[:10]}@example.com",
        password_hash=get_password_hash(password),
        role=role,
        business_id=business.id if business else None,
        **kw,
    )
    db.add(user)
    db.flush()
    return user


def make_client_row(db: Session, name: str = "Client", **kw) -> Client:
    """Insert a client; business_id is filled by the DB default when scoped."""
    kw.setdefault("contact_info", {})
    client = Client(id=uuid.uuid4(), name=name, **kw)
    db.add(client)
    db.flush()
    return client


def auth(user: User) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id), email=user.email, role=user.role
    )
    return {"Authorization": f"Bearer {token}"}
