"""Tests for the macOS Keychain-backed OpenRouter credential store."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from keychain import OpenRouterKeyStore, SecretStoreError


class FakeKeyring:
    def __init__(self) -> None:
        self.values: dict[tuple[str, str], str] = {}

    def get_password(self, service: str, account: str) -> str | None:
        return self.values.get((service, account))

    def set_password(self, service: str, account: str, value: str) -> None:
        self.values[(service, account)] = value

    def delete_password(self, service: str, account: str) -> None:
        self.values.pop((service, account), None)


def test_openrouter_key_store_round_trips_without_persisting_to_config():
    keyring = FakeKeyring()
    store = OpenRouterKeyStore(keyring_module=keyring)

    assert store.get() is None
    assert store.is_configured() is False

    store.set("sk-or-v1-synthetic-test-key")

    assert store.get() == "sk-or-v1-synthetic-test-key"
    assert store.is_configured() is True

    store.delete()

    assert store.get() is None
    assert store.is_configured() is False


def test_openrouter_key_store_rejects_blank_values():
    store = OpenRouterKeyStore(keyring_module=FakeKeyring())

    with pytest.raises(SecretStoreError, match="empty"):
        store.set("   ")
