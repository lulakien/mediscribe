"""
Configuration manager for MediScribe desktop application.

Manages a single JSON config file with user settings and defaults.
Schema matches DESIGN.md §10.6 requirements.
"""

import json
import os
import re
from pathlib import Path
from typing import Any, Optional
from dataclasses import dataclass, asdict, field


# Default Turkish medical initial prompt from prototype config.yaml
DEFAULT_INITIAL_PROMPT = """Bu kayıt Türkçe bir tıp dersi kaydıdır. Tıbbi terimleri, anatomi, \
fizyoloji, patoloji, farmakoloji, biyokimya, histoloji, embriyoloji \
ve klinik ifadeleri mümkün olduğunca doğru yaz. Latince anatomik \
terimleri koru. Kısaltmaları doğru aktar. Konuşma Türkçedir; \
gereksiz İngilizce çeviri yapma."""

_OPENROUTER_TRANSCRIPTION_URL = "https://openrouter.ai/api/v1/audio/transcriptions"
_OPENROUTER_MODELS = {
    "microsoft/mai-transcribe-1.5",
    "microsoft/mai-transcribe-2",
}
_API_GATEWAY_FIELDS = {
    "enabled",
    "provider",
    "endpoint_url",
    "api_key_env_var",
    "model_name",
    "timeout_seconds",
}
_ENV_VAR_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _validate_api_gateway(value: Any) -> dict[str, Any]:
    """Validate gateway metadata without accepting a credential value."""
    if not isinstance(value, dict):
        raise ValueError("apiGateway must be an object")
    if set(value) - _API_GATEWAY_FIELDS:
        raise ValueError("apiGateway contains unsupported fields")

    enabled = value.get("enabled", False)
    if not isinstance(enabled, bool):
        raise ValueError("apiGateway.enabled must be a boolean")

    provider = value.get("provider")
    if provider not in (None, "openrouter"):
        raise ValueError("apiGateway provider is unsupported")

    endpoint_url = value.get("endpoint_url")
    if endpoint_url not in (None, _OPENROUTER_TRANSCRIPTION_URL):
        raise ValueError("apiGateway endpoint is not the canonical OpenRouter endpoint")

    key_env_var = value.get("api_key_env_var")
    if key_env_var is not None:
        if not isinstance(key_env_var, str) or not _ENV_VAR_NAME_RE.fullmatch(key_env_var):
            raise ValueError("apiGateway API-key environment-variable name is invalid")

    model_name = value.get("model_name")
    if model_name is not None and model_name not in _OPENROUTER_MODELS:
        raise ValueError("apiGateway model is unsupported")

    timeout_seconds = value.get("timeout_seconds")
    if timeout_seconds is not None:
        if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, (int, float)):
            raise ValueError("apiGateway timeout must be numeric")
        if timeout_seconds <= 0 or timeout_seconds > 600:
            raise ValueError("apiGateway timeout is outside the allowed range")

    return dict(value)


@dataclass
class ConfigSchema:
    """
    Application configuration schema.

    All fields match the requirements from DESIGN.md §10.6.
    Defaults seeded from prototype's config.yaml values.
    """
    # Schema version for future migrations
    v: int = 1

    # Transcription defaults
    defaultOutputFolder: Optional[str] = None  # None means use ~/Documents/MediScribe
    defaultModel: str = "large-v3"  # From prototype config.yaml
    defaultPreset: str = "Best Quality"  # UI preset name

    # UI state
    showWelcomeOnLaunch: bool = True  # Show welcome until user completes first launch
    firstLaunchCompleted: bool = False
    theme: str = "Warm Light"  # "Warm Light" | "Study Night" | "System"
    advancedMode: bool = False

    # Backend settings (advanced)
    language: str = "tr"  # From prototype config.yaml
    initialPrompt: str = field(default_factory=lambda: DEFAULT_INITIAL_PROMPT)

    # Last custom advanced settings (preserved when switching from preset to custom)
    customAdvanced: dict = field(default_factory=lambda: {
        "model": "large-v3",
        "device": "auto",
        "compute_type": "auto",
        "beam_size": 5,
        "vad_filter": True,
        "normalize_audio": False,
        "overwrite_outputs": False,
        "condition_on_previous_text": False,
        "temperature": 0
    })

    # Optional API gateway settings. The core caps requests at 60 seconds.
    apiGateway: dict = field(default_factory=lambda: {
        "enabled": False,
        "provider": None,
        "endpoint_url": None,
        "api_key_env_var": None,
        "model_name": None,
        "timeout_seconds": 60
    })

    # Recent output folders for Results page (Decision 3, §16.1)
    recentOutputFolders: list = field(default_factory=list)


class ConfigManager:
    """
    Manages the application configuration file.

    Provides GET/PUT operations for the config schema.
    Thread-safe for single writer, multiple readers (typical desktop app pattern).
    """

    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize config manager.

        Args:
            config_path: Absolute path to config file. If None, uses
                        $XDG_CONFIG_HOME/mediscribe/config.json (or equivalent).
        """
        if config_path:
            self.config_path = Path(config_path)
        else:
            # Electron-provided data roots must stay isolated from other
            # MediScribe installations on the same machine.
            data_dir = os.environ.get('MEDISCRIBE_DATA_DIR')
            if data_dir:
                self.config_path = Path(data_dir).expanduser() / 'config.json'
            else:
                # XDG_CONFIG_HOME or fallback to ~/.config
                config_home = os.environ.get('XDG_CONFIG_HOME')
                if not config_home:
                    config_home = Path.home() / '.config'
                else:
                    config_home = Path(config_home)

                self.config_path = config_home / 'mediscribe' / 'config.json'

        self._config: Optional[ConfigSchema] = None
        self._ensure_config_exists()

    def _ensure_config_exists(self) -> None:
        """Create config directory and file with defaults if they don't exist."""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)

        if not self.config_path.exists():
            # Create with default values
            default_config = ConfigSchema()
            self._write_config(default_config)

    def _read_config(self) -> ConfigSchema:
        """Read and parse config file."""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Handle schema version migrations here if needed in future
            if data.get('v', 1) != 1:
                # Future: migration logic
                pass

            # Reconstruct ConfigSchema from dict
            # Handle missing fields gracefully by merging with defaults
            default = asdict(ConfigSchema())
            merged = {**default, **data}
            gateway = _validate_api_gateway(merged.get("apiGateway", default["apiGateway"]))
            merged["apiGateway"] = {**default["apiGateway"], **gateway}

            return ConfigSchema(**merged)

        except (json.JSONDecodeError, FileNotFoundError, KeyError, TypeError, ValueError):
            # Corrupted or missing config: return defaults and rewrite
            print("Config read error; using defaults")
            default_config = ConfigSchema()
            self._write_config(default_config)
            return default_config

    def _write_config(self, config: ConfigSchema) -> None:
        """Write config to file."""
        data = asdict(config)

        with open(self.config_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def get(self) -> dict:
        """
        Get current configuration as a dictionary.

        Returns:
            Config dictionary matching ConfigSchema structure.
        """
        self._config = self._read_config()
        return asdict(self._config)

    def put(self, updates: dict) -> dict:
        """
        Update configuration with partial updates.

        Args:
            updates: Dictionary of fields to update. Only provided fields
                    are changed; others remain unchanged.

        Returns:
            Updated config dictionary.

        Raises:
            ValueError: If updates contain invalid fields or values.
        """
        current = self._read_config()
        current_dict = asdict(current)

        # Validate and apply updates
        for key, value in updates.items():
            if key not in current_dict:
                raise ValueError(f"Unknown config field: {key}")

            # Type validation for critical fields
            if key == 'v':
                raise ValueError("Schema version 'v' cannot be modified")

            if key == 'theme' and value not in ["Warm Light", "Study Night", "System"]:
                raise ValueError(f"Invalid theme: {value}")

            if key == 'defaultPreset' and value not in [
                "Best Quality", "Bad Audio / Conference Hall",
                "Fast Batch", "Low VRAM Safe", "Custom"
            ]:
                raise ValueError(f"Invalid preset: {value}")

            if key == 'apiGateway':
                gateway = _validate_api_gateway(value)
                current_gateway = current_dict.get('apiGateway') or asdict(ConfigSchema())['apiGateway']
                current_dict[key] = {**current_gateway, **gateway}
                continue

            # Apply update
            current_dict[key] = value

        # Reconstruct and save
        updated_config = ConfigSchema(**current_dict)
        self._write_config(updated_config)

        self._config = updated_config
        return asdict(updated_config)

    def get_field(self, field: str) -> Any:
        """
        Get a single config field value.

        Args:
            field: Field name from ConfigSchema.

        Returns:
            Field value.

        Raises:
            KeyError: If field doesn't exist.
        """
        config = self.get()
        if field not in config:
            raise KeyError(f"Config field not found: {field}")
        return config[field]

    def put_field(self, field: str, value: Any) -> dict:
        """
        Update a single config field.

        Args:
            field: Field name from ConfigSchema.
            value: New value for the field.

        Returns:
            Updated config dictionary.
        """
        return self.put({field: value})

    def reset_to_defaults(self) -> dict:
        """
        Reset configuration to default values.

        Preserves firstLaunchCompleted to avoid re-showing welcome unnecessarily.

        Returns:
            Reset config dictionary.
        """
        current = self._read_config()
        default_config = ConfigSchema()

        # Preserve launch state
        default_config.firstLaunchCompleted = current.firstLaunchCompleted

        self._write_config(default_config)
        self._config = default_config
        return asdict(default_config)

    def add_recent_output_folder(self, folder_path: str, max_recent: int = 10) -> None:
        """
        Add a folder to recent output folders list.

        Maintains a FIFO list of up to max_recent folders.
        Used by Results page for manifest indexing (DESIGN.md §16.1 Decision 3).

        Args:
            folder_path: Absolute path to output folder.
            max_recent: Maximum number of recent folders to keep.
        """
        folder_path = str(Path(folder_path).resolve())

        current = self._read_config()
        recent = current.recentOutputFolders.copy()

        # Remove if already exists (will re-add at front)
        if folder_path in recent:
            recent.remove(folder_path)

        # Add to front
        recent.insert(0, folder_path)

        # Trim to max_recent
        recent = recent[:max_recent]

        self.put({'recentOutputFolders': recent})

    @property
    def path(self) -> Path:
        """Get the config file path."""
        return self.config_path


# Singleton instance for import convenience
_default_manager: Optional[ConfigManager] = None


def get_config_manager(config_path: Optional[str] = None) -> ConfigManager:
    """
    Get the default ConfigManager instance.

    Args:
        config_path: Optional custom config path. Only used on first call.

    Returns:
        ConfigManager instance.
    """
    global _default_manager

    if _default_manager is None:
        _default_manager = ConfigManager(config_path)

    return _default_manager


# Convenience functions for direct access
def get_config() -> dict:
    """Get current configuration."""
    return get_config_manager().get()


def update_config(updates: dict) -> dict:
    """Update configuration with partial updates."""
    return get_config_manager().put(updates)


def get_config_field(field: str) -> Any:
    """Get a single config field."""
    return get_config_manager().get_field(field)


def update_config_field(field: str, value: Any) -> dict:
    """Update a single config field."""
    return get_config_manager().put_field(field, value)
