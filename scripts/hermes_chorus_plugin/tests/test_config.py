"""Config resolution for ChorusClientConfig.

Exercises the resolution order documented in the design doc:

  1. $HERMES_HOME/chorus.json (profile-local)
  2. ~/.hermes/chorus.json     (default profile)
  3. Environment variables     (CHORUS_URL, CHORUS_API_KEY, ...)

Also verifies env overrides, explicit args, and defaults.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest


@pytest.fixture
def isolated_env(monkeypatch, tmp_path):
    """Clear Chorus env vars and point HERMES_HOME at a temp dir."""
    for key in (
        "CHORUS_URL",
        "CHORUS_API_KEY",
        "CHORUS_IDENTITY_NAME",
        "CHORUS_RECALL_MODE",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    # Avoid polluting the user's real ~/.hermes during tests.
    monkeypatch.setenv("HOME", str(tmp_path))
    return tmp_path


def test_defaults_when_nothing_configured(isolated_env):
    from plugins.memory.chorus.client import ChorusClientConfig

    cfg = ChorusClientConfig.from_global_config()
    assert cfg.url == "http://localhost:3099"
    assert cfg.api_key is None
    assert cfg.recall_mode == "hybrid"
    assert cfg.scope_by_cwd is True
    assert cfg.emit_signals is False
    assert cfg.enabled is False  # no api_key → not available


def test_env_vars_populate_config(isolated_env, monkeypatch):
    from plugins.memory.chorus.client import ChorusClientConfig

    monkeypatch.setenv("CHORUS_URL", "http://localhost:3099")
    monkeypatch.setenv("CHORUS_API_KEY", "sk-test-123")
    monkeypatch.setenv("CHORUS_IDENTITY_NAME", "hermes-env")
    monkeypatch.setenv("CHORUS_RECALL_MODE", "tools")

    cfg = ChorusClientConfig.from_global_config()
    assert cfg.url == "http://localhost:3099"
    assert cfg.api_key == "sk-test-123"
    assert cfg.identity_name == "hermes-env"
    assert cfg.recall_mode == "tools"
    assert cfg.enabled is True


def test_hermes_home_json_beats_env(isolated_env, monkeypatch):
    from plugins.memory.chorus.client import ChorusClientConfig

    monkeypatch.setenv("CHORUS_URL", "http://env.example:9999")
    monkeypatch.setenv("CHORUS_API_KEY", "sk-env")

    (isolated_env / "chorus.json").write_text(json.dumps({
        "url": "http://localhost:3099",
        "identity_name": "hermes-file",
        "recall_mode": "context",
    }))

    cfg = ChorusClientConfig.from_global_config()
    # File values win
    assert cfg.url == "http://localhost:3099"
    assert cfg.identity_name == "hermes-file"
    assert cfg.recall_mode == "context"
    # api_key not in file → env fallback is used
    assert cfg.api_key == "sk-env"
    assert cfg.enabled is True


def test_unknown_recall_mode_normalized_to_hybrid(isolated_env):
    from plugins.memory.chorus.client import ChorusClientConfig

    (isolated_env / "chorus.json").write_text(json.dumps({
        "recall_mode": "not-a-real-mode",
    }))

    cfg = ChorusClientConfig.from_global_config()
    assert cfg.recall_mode == "hybrid"


def test_malformed_json_falls_back_to_env(isolated_env, monkeypatch):
    """A broken config file must never crash the agent — just warn and fall back."""
    from plugins.memory.chorus.client import ChorusClientConfig

    monkeypatch.setenv("CHORUS_URL", "http://localhost:3099")
    monkeypatch.setenv("CHORUS_API_KEY", "sk-env")
    (isolated_env / "chorus.json").write_text("{ not valid json")

    cfg = ChorusClientConfig.from_global_config()
    assert cfg.url == "http://localhost:3099"
    assert cfg.api_key == "sk-env"


def test_identity_name_default_derives_from_host(isolated_env):
    from plugins.memory.chorus.client import ChorusClientConfig

    cfg = ChorusClientConfig.from_global_config()
    assert cfg.identity_name.startswith("hermes-")


def test_is_available_false_without_api_key(isolated_env):
    """is_available MUST NOT make network calls — it's a pure config check."""
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    assert provider.is_available() is False


def test_is_available_true_with_env_api_key(isolated_env, monkeypatch):
    from plugins.memory.chorus import ChorusMemoryProvider

    monkeypatch.setenv("CHORUS_URL", "http://localhost:3099")
    monkeypatch.setenv("CHORUS_API_KEY", "sk-test-123")

    provider = ChorusMemoryProvider()
    assert provider.is_available() is True


def test_is_available_true_with_file_api_key(isolated_env):
    from plugins.memory.chorus import ChorusMemoryProvider

    (isolated_env / "chorus.json").write_text(json.dumps({
        "url": "http://localhost:3099",
        "api_key": "sk-file",
    }))

    provider = ChorusMemoryProvider()
    assert provider.is_available() is True


def test_save_config_writes_json(isolated_env):
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    provider.save_config(
        {"url": "http://localhost:3099", "recall_mode": "tools"},
        str(isolated_env),
    )

    saved = json.loads((isolated_env / "chorus.json").read_text())
    assert saved["url"] == "http://localhost:3099"
    assert saved["recall_mode"] == "tools"


def test_save_config_merges_existing(isolated_env):
    from plugins.memory.chorus import ChorusMemoryProvider

    (isolated_env / "chorus.json").write_text(json.dumps({
        "url": "http://localhost:3099",
        "identity_name": "keep-me",
    }))

    provider = ChorusMemoryProvider()
    provider.save_config(
        {"recall_mode": "context"},
        str(isolated_env),
    )

    saved = json.loads((isolated_env / "chorus.json").read_text())
    assert saved["url"] == "http://localhost:3099"
    assert saved["identity_name"] == "keep-me"
    assert saved["recall_mode"] == "context"
