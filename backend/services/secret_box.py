"""Symmetric encryption for secrets stored in the database (per-business API keys).

The key comes from SECRETS_ENCRYPTION_KEY (a Fernet key). When unset it is
derived from JWT_SECRET, so rotating JWT_SECRET without setting a dedicated
key makes previously stored secrets undecryptable.
"""

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from ..core.config import settings


@lru_cache
def _fernet() -> Fernet:
    if settings.secrets_encryption_key:
        return Fernet(settings.secrets_encryption_key.encode())
    digest = hashlib.sha256(settings.jwt_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_secret(token: str) -> str | None:
    """Return the plaintext, or None if it can no longer be decrypted."""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None
