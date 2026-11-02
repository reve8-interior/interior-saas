"""Plans carry a monthly AI credit allowance; hand entry is untouched."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from backend.models.user import UserRole
from backend.services.ai_access import (
    OP_CHECKPOINT_EXTRACT,
    ai_status,
    log_ai_usage,
)
from backend.services.plan_catalog import DEFAULTS_BY_SLUG
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
FREE_CREDITS = DEFAULTS_BY_SLUG["free"].ai_credits_monthly


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


def test_paid_plan_has_its_own_credit_allowance(db):
    status = ai_status(db, business(db, plan="studio"))
    assert status.enabled is True
    assert (
        status.monthly_limit == DEFAULTS_BY_SLUG["studio"].ai_credits_monthly
    )
    assert status.remaining == status.monthly_limit


def test_legacy_pro_slug_maps_to_studio(db):
    status = ai_status(db, business(db, plan="pro"))
    assert (
        status.monthly_limit == DEFAULTS_BY_SLUG["studio"].ai_credits_monthly
    )


def test_bonus_credits_add_to_the_plan(db):
    status = ai_status(db, business(db, plan="free", ai_credit_bonus=5))
    assert status.monthly_limit == FREE_CREDITS + 5


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
    assert status.monthly_limit == FREE_CREDITS
    assert status.remaining == FREE_CREDITS - 2


def test_extract_refused_at_the_limit_without_calling_the_agent(api, db):
    biz = business(db, plan="free")
    user = make_user(db, role=UserRole.admin, business=biz)
    as_business(db, biz.id)
    client = make_client_row(db, "C")
    log_extractions(db, FREE_CREDITS)
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
        "monthly_limit": FREE_CREDITS,
        "remaining": FREE_CREDITS - 1,
    }
