"""Focused tests for safe transcription gateway configuration."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from config_manager import ConfigManager


def test_api_gateway_accepts_openrouter_without_secret_value(tmp_path: Path):
    config_path = tmp_path / "config.json"
    result = ConfigManager(str(config_path)).put({
        "apiGateway": {
            "enabled": True,
            "provider": "openrouter",
            "endpoint_url": None,
            "api_key_env_var": "OPENROUTER_API_KEY",
            "model_name": "microsoft/mai-transcribe-2",
            "timeout_seconds": 60,
        }
    })

    assert result["apiGateway"]["api_key_env_var"] == "OPENROUTER_API_KEY"
    persisted = json.loads(config_path.read_text(encoding="utf-8"))
    assert "api_key" not in persisted["apiGateway"]


def test_api_gateway_rejects_secret_value(tmp_path: Path):
    manager = ConfigManager(str(tmp_path / "config.json"))

    with pytest.raises(ValueError, match="apiGateway"):
        manager.put({
            "apiGateway": {
                "enabled": True,
                "provider": "openrouter",
                "api_key": "synthetic-test-key",
            }
        })


def test_api_gateway_rejects_unknown_fields_and_redirect_endpoint(tmp_path: Path):
    manager = ConfigManager(str(tmp_path / "config.json"))

    with pytest.raises(ValueError, match="apiGateway"):
        manager.put({
            "apiGateway": {
                "enabled": True,
                "provider": "openrouter",
                "unexpected": True,
            }
        })

    with pytest.raises(ValueError, match="endpoint"):
        manager.put({
            "apiGateway": {
                "enabled": True,
                "provider": "openrouter",
                "endpoint_url": "https://example.invalid",
            }
        })
