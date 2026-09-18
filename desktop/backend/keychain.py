"""Small macOS Keychain adapter for secrets owned by this sandbox install.

The desktop JSON configuration intentionally contains provider metadata only.
OpenRouter credentials live in a separate Keychain service so this checkout
cannot overwrite or share a credential with another MediScribe installation.
"""

from __future__ import annotations

from typing import Any


KEYCHAIN_SERVICE = "com.lulakien.mediscribe-lulakien-sandbox"
OPENROUTER_ACCOUNT = "openrouter-api-key"


class SecretStoreError(RuntimeError):
    """Raised when the platform secret store cannot complete an operation."""


class OpenRouterKeyStore:
    """Store one OpenRouter key in the macOS Keychain via Python keyring."""

    def __init__(self, keyring_module: Any | None = None) -> None:
        if keyring_module is None:
            try:
                import keyring as keyring_module
            except ImportError as exc:
                raise SecretStoreError(
                    "The secure credential store is unavailable. Install the desktop requirements."
                ) from exc
        self._keyring = keyring_module

    def get(self) -> str | None:
        try:
            value = self._keyring.get_password(KEYCHAIN_SERVICE, OPENROUTER_ACCOUNT)
        except Exception as exc:
            raise SecretStoreError(
                "macOS Keychain could not be read. Check Keychain access and try again."
            ) from exc
        if not value:
            return None
        return str(value).strip() or None

    def is_configured(self) -> bool:
        return self.get() is not None

    def set(self, value: str) -> None:
        secret = str(value).strip()
        if not secret:
            raise SecretStoreError("The OpenRouter API key cannot be empty.")
        try:
            self._keyring.set_password(KEYCHAIN_SERVICE, OPENROUTER_ACCOUNT, secret)
        except Exception as exc:
            raise SecretStoreError(
                "macOS Keychain could not save the OpenRouter API key."
            ) from exc

    def delete(self) -> None:
        try:
            self._keyring.delete_password(KEYCHAIN_SERVICE, OPENROUTER_ACCOUNT)
        except Exception as exc:
            # Deleting an already-empty entry is idempotent. Keyring backends
            # do not share one exception type for that condition, so only
            # suppress it when a follow-up read confirms it is absent.
            try:
                if self.get() is None:
                    return
            except SecretStoreError:
                pass
            raise SecretStoreError(
                "macOS Keychain could not remove the OpenRouter API key."
            ) from exc
