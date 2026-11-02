import pytest
from pydantic import ValidationError

from backend.schemas.business import (
    BusinessCreate,
    BusinessUpdate,
    OpenAISettingsUpdate,
)

KEY = "sk-" + "a" * 30


def test_key_only_is_valid_and_stripped():
    body = OpenAISettingsUpdate(api_key=f"  {KEY}  ")
    assert body.api_key == KEY
    assert body.chat_model is None and body.whisper_model is None


@pytest.mark.parametrize(
    "bad",
    ["", "abc", "sk-short", "pk-" + "a" * 30, "sk-has space-" + "a" * 30],
)
def test_bad_keys_rejected(bad):
    with pytest.raises(ValidationError):
        OpenAISettingsUpdate(api_key=bad)


def test_chat_model_and_whisper_only_are_valid():
    body = OpenAISettingsUpdate(chat_model="gpt-5")
    assert body.chat_model == "gpt-5"
    assert body.whisper_model is None
    body = OpenAISettingsUpdate(whisper_model="whisper-1")
    assert body.whisper_model == "whisper-1"


def test_empty_model_means_reset_and_is_allowed():
    assert OpenAISettingsUpdate(chat_model="").chat_model == ""
    assert OpenAISettingsUpdate(whisper_model="").whisper_model == ""


def test_nothing_to_change_rejected():
    with pytest.raises(ValidationError):
        OpenAISettingsUpdate()


@pytest.mark.parametrize("bad", ["gpt 4", "-gpt", "gpt/4", "x" * 101, "a;b"])
def test_invalid_model_names_rejected(bad):
    for field in ("chat_model", "whisper_model"):
        with pytest.raises(ValidationError):
            OpenAISettingsUpdate(**{field: bad})


@pytest.mark.parametrize(
    "good",
    ["gpt-4.1-mini", "gpt-4o-mini-transcribe", "ft:gpt-4o:org:abc", "o3"],
)
def test_valid_model_names_accepted(good):
    assert OpenAISettingsUpdate(chat_model=good).chat_model == good


def test_business_create_requires_name():
    with pytest.raises(ValidationError):
        BusinessCreate(name="")


def test_business_create_admin_password_min_length():
    with pytest.raises(ValidationError):
        BusinessCreate(name="X", admin_email="a@b.com", admin_password="short")


def test_business_update_all_optional():
    assert BusinessUpdate().model_dump(exclude_unset=True) == {}


def test_create_overrides_default_to_following_the_plan():
    body = BusinessCreate(name="X")
    assert body.plan == "free"
    for field in (
        "max_users",
        "max_images",
        "max_image_mb",
        "max_clients",
        "max_quotation_versions",
        "max_portfolio_designs",
    ):
        assert getattr(body, field) is None


@pytest.mark.parametrize(
    "field,value",
    [
        ("max_users", 0),
        ("max_image_mb", 101),
        ("max_clients", -1),
        ("max_quotation_versions", 1001),
        ("ai_credit_bonus", -1),
        ("plan", "Bad Slug"),
    ],
)
def test_create_rejects_out_of_range_overrides(field, value):
    with pytest.raises(ValidationError):
        BusinessCreate(name="X", **{field: value})
