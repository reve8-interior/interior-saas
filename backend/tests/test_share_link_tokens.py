"""Readable share-link tokens."""

import re
import secrets

from backend.services.share_links import is_readable, readable_token


def test_name_becomes_a_clean_slug_with_a_random_suffix():
    token = readable_token("Müller & Söhne GmbH")
    assert re.fullmatch(r"muller-sohne-gmbh-[a-z2-9]{8}", token)


def test_long_names_are_trimmed():
    token = readable_token("a" * 100)
    assert len(token) <= 30 + 1 + 8


def test_unusable_names_still_get_a_token():
    assert re.fullmatch(r"[a-z2-9]{8}", readable_token("!!!"))
    assert re.fullmatch(r"[a-z2-9]{8}", readable_token(""))


def test_tokens_differ():
    assert readable_token("Rao") != readable_token("Rao")


def test_old_random_tokens_are_not_readable():
    assert is_readable(readable_token("Rao"))
    assert not is_readable(secrets.token_urlsafe(32))
