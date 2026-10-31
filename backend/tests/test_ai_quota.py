"""Free businesses get a monthly extraction allowance; hand entry is untouched."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from backend.models.user import UserRole
from backend.services.ai_access import (
    FREE_PLAN_MONTHLY_EXTRACTIONS,
    OP_CHECKPOINT_EXTRACT,
    ai_status,
    log_ai_usage,
)
from backend.services.secret_box import encrypt_secret

from .conftest import (
    as_business,
    auth,
    make_business,
    make_client_row,
    make_user,
)

AGENT = "backend.services.checkpoint_extraction.run_checkpoint_extraction"
KEY = "sk-" + "q" * 30


def business(db, **kw):
    biz = make_business(db, openai_api_key_enc=encrypt_secret(KEY), **kw)
    as_business(db, biz.id)
    return biz


def log_extractions(db, count, status="success"):
    for _ in range(count):
        log_ai_usage(
            db,
            operation=OP_CHECKPOINT_EXTRACT,
            model="gpt-4o-mini",
            latency_ms=1,
            status=status,
        )


def test_no_business_or_no_key_is_off(db):
    assert ai_status(db, None).enabled is False
    assert ai_status(db, make_business(db)).enabled is False


def test_pro_has_no_cap(db):
    status = ai_status(db, business(db, plan="pro"))
    assert status.enabled is True
    assert status.monthly_limit is None
    assert status.remaining is None


def test_free_counts_only_this_months_successes(db):
    biz = business(db, plan="free")
    log_extractions(db, 2)
    log_extractions(db, 1, status="error")
    old = log_ai_usage(
        db,
        operation=OP_CHECKPOINT_EXTRACT,
        model="gpt-4o-mini",
        latency_ms=1,
        status="success",
    )
    old.timestamp = datetime.now(timezone.utc).replace(day=1) - timedelta(
        days=1
    )
    db.flush()
    status = ai_status(db, biz)
    assert status.monthly_limit == FREE_PLAN_MONTHLY_EXTRACTIONS
    assert status.remaining == FREE_PLAN_MONTHLY_EXTRACTIONS - 2


def test_extract_refused_at_the_limit_without_calling_the_agent(api, db):
    biz = business(db, plan="free")
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    client = make_client_row(db, "C")
    log_extractions(db, FREE_PLAN_MONTHLY_EXTRACTIONS)
    agent = AsyncMock()
    with patch(AGENT, agent):
        r = api.post(
            f"/api/v1/clients/{client.id}/checkpoints/extract",
            headers=auth(user),
            data={"text": "Master bedroom wardrobe 8x7 ft"},
        )
    assert r.status_code == 403
    assert "by hand" in r.json()["detail"]
    agent.assert_not_awaited()


def test_me_reports_ai_status(api, db):
    biz = business(db, plan="free")
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    log_extractions(db, 1)
    body = api.get("/api/v1/auth/me", headers=auth(user)).json()
    assert body["ai"] == {
        "enabled": True,
        "monthly_limit": FREE_PLAN_MONTHLY_EXTRACTIONS,
        "remaining": FREE_PLAN_MONTHLY_EXTRACTIONS - 1,
    }
