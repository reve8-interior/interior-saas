import pytest
from cryptography.fernet import Fernet

from backend.services import secret_box


@pytest.fixture(autouse=True)
def fresh_key_cache():
    secret_box._fernet.cache_clear()
    yield
    secret_box._fernet.cache_clear()


def test_roundtrip():
    token = secret_box.encrypt_secret("sk-test-key-1234567890")
    assert token != "sk-test-key-1234567890"
    assert secret_box.decrypt_secret(token) == "sk-test-key-1234567890"


def test_encryption_is_not_deterministic():
    a = secret_box.encrypt_secret("same")
    b = secret_box.encrypt_secret("same")
    assert a != b


def test_garbage_token_is_undecryptable():
    assert secret_box.decrypt_secret("not-a-token") is None


def test_explicit_key_is_used(monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setattr(secret_box.settings, "secrets_encryption_key", key)
    token = secret_box.encrypt_secret("hello")
    assert Fernet(key.encode()).decrypt(token.encode()) == b"hello"


def test_changing_jwt_secret_breaks_derived_key(monkeypatch):
    monkeypatch.setattr(secret_box.settings, "secrets_encryption_key", "")
    monkeypatch.setattr(secret_box.settings, "jwt_secret", "secret-one")
    token = secret_box.encrypt_secret("hello")
    secret_box._fernet.cache_clear()
    monkeypatch.setattr(secret_box.settings, "jwt_secret", "secret-two")
    assert secret_box.decrypt_secret(token) is None


def test_dedicated_key_survives_jwt_secret_rotation(monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setattr(secret_box.settings, "secrets_encryption_key", key)
    token = secret_box.encrypt_secret("hello")
    monkeypatch.setattr(secret_box.settings, "jwt_secret", "rotated")
    secret_box._fernet.cache_clear()
    assert secret_box.decrypt_secret(token) == "hello"
