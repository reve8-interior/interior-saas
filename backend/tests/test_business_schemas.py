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
    assert body.economy_model is None and body.whisper_model is None


@pytest.mark.parametrize(
    "bad",
    ["", "abc", "sk-short", "pk-" + "a" * 30, "sk-has space-" + "a" * 30],
)
def test_bad_keys_rejected(bad):
    with pytest.raises(ValidationError):
        OpenAISettingsUpdate(api_key=bad)


def test_single_tier_and_whisper_only_are_valid():
    body = OpenAISettingsUpdate(premium_model="gpt-5")
    assert body.premium_model == "gpt-5"
    assert body.economy_model is None
    body = OpenAISettingsUpdate(whisper_model="whisper-1")
    assert body.whisper_model == "whisper-1"


def test_empty_model_means_reset_and_is_allowed():
    assert OpenAISettingsUpdate(balanced_model="").balanced_model == ""
    assert OpenAISettingsUpdate(whisper_model="").whisper_model == ""


def test_nothing_to_change_rejected():
    with pytest.raises(ValidationError):
        OpenAISettingsUpdate()


@pytest.mark.parametrize("bad", ["gpt 4", "-gpt", "gpt/4", "x" * 101, "a;b"])
def test_invalid_model_names_rejected(bad):
    for field in (
        "economy_model",
        "balanced_model",
        "premium_model",
        "whisper_model",
    ):
        with pytest.raises(ValidationError):
            OpenAISettingsUpdate(**{field: bad})


@pytest.mark.parametrize(
    "good",
    ["gpt-4.1-mini", "gpt-4o-mini-transcribe", "ft:gpt-4o:org:abc", "o3"],
)
def test_valid_model_names_accepted(good):
    assert OpenAISettingsUpdate(economy_model=good).economy_model == good


def test_business_create_requires_name():
    with pytest.raises(ValidationError):
        BusinessCreate(name="")


def test_business_create_admin_password_min_length():
    with pytest.raises(ValidationError):
        BusinessCreate(name="X", admin_email="a@b.com", admin_password="short")


def test_business_update_all_optional():
    assert BusinessUpdate().model_dump(exclude_unset=True) == {}
