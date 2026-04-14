"""Tests for ``ChorusMemoryProvider.initialize`` — cron guard, whoami probe,
soft-fail on connection errors.
"""

from __future__ import annotations

import logging
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def isolated_env(monkeypatch, tmp_path):
    for key in (
        "CHORUS_URL", "CHORUS_API_KEY", "CHORUS_IDENTITY_NAME", "CHORUS_RECALL_MODE",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("CHORUS_URL", "http://localhost:3099")
    monkeypatch.setenv("CHORUS_API_KEY", "sk-test")
    return tmp_path


def test_initialize_short_circuits_on_cron_context(isolated_env):
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()

    with patch("plugins.memory.chorus.client.ChorusClient") as client_cls:
        provider.initialize(
            "test-session",
            agent_context="cron",
            platform="cron",
        )

    client_cls.assert_not_called()
    assert provider._cron_skipped is True


def test_initialize_short_circuits_on_flush_context(isolated_env):
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    with patch("plugins.memory.chorus.client.ChorusClient") as client_cls:
        provider.initialize("test-session", agent_context="flush")
    client_cls.assert_not_called()
    assert provider._cron_skipped is True


def test_initialize_calls_whoami_and_stores_identity(isolated_env):
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()

    fake_client = MagicMock()
    fake_client.whoami.return_value = {
        "id": "identity:abc",
        "name": "hermes-test",
        "type": "agent",
        "capabilities": ["memory:store", "memory:query"],
        "is_admin": False,
    }

    with patch("plugins.memory.chorus.ChorusClient", return_value=fake_client):
        provider.initialize("sess-1", cwd="/home/inu/hermelinChat")

    fake_client.whoami.assert_called_once()
    assert provider._identity == {
        "id": "identity:abc",
        "name": "hermes-test",
        "type": "agent",
        "capabilities": ["memory:store", "memory:query"],
        "is_admin": False,
    }
    assert provider._inactive_reason is None


def test_initialize_marks_inactive_on_auth_error(isolated_env, caplog):
    from plugins.memory.chorus import ChorusMemoryProvider
    from plugins.memory.chorus.client import ChorusAuthError

    provider = ChorusMemoryProvider()
    fake_client = MagicMock()
    fake_client.whoami.side_effect = ChorusAuthError("bad token")

    with caplog.at_level(logging.WARNING, logger="plugins.memory.chorus"):
        with patch("plugins.memory.chorus.ChorusClient", return_value=fake_client):
            provider.initialize("sess-1")

    assert provider._inactive_reason is not None
    assert "auth" in provider._inactive_reason.lower()
    assert any("auth" in r.message.lower() for r in caplog.records)


def test_initialize_marks_inactive_on_unreachable(isolated_env, caplog):
    from plugins.memory.chorus import ChorusMemoryProvider
    from plugins.memory.chorus.client import ChorusUnreachableError

    provider = ChorusMemoryProvider()
    fake_client = MagicMock()
    fake_client.whoami.side_effect = ChorusUnreachableError("connection refused")

    with caplog.at_level(logging.WARNING, logger="plugins.memory.chorus"):
        with patch("plugins.memory.chorus.ChorusClient", return_value=fake_client):
            provider.initialize("sess-1")

    assert provider._inactive_reason is not None
    assert "unreachable" in provider._inactive_reason.lower() or "refused" in provider._inactive_reason.lower()
    # Must NOT raise — agent must keep running.


def test_initialize_marks_inactive_when_unconfigured(monkeypatch, tmp_path):
    """No url / api_key → provider inactive, no network attempted."""
    from plugins.memory.chorus import ChorusMemoryProvider

    for key in (
        "CHORUS_URL", "CHORUS_API_KEY", "CHORUS_IDENTITY_NAME", "CHORUS_RECALL_MODE",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("HOME", str(tmp_path))

    provider = ChorusMemoryProvider()

    with patch("plugins.memory.chorus.ChorusClient") as client_cls:
        provider.initialize("sess-1")

    client_cls.assert_not_called()
    assert provider._inactive_reason is not None


def test_initialize_resolves_ring_from_cwd(isolated_env):
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    fake_client = MagicMock()
    fake_client.whoami.return_value = {"id": "x", "name": "y"}

    with patch("plugins.memory.chorus.ChorusClient", return_value=fake_client):
        provider.initialize("sess-1", cwd="/home/inu/hermelinChat")

    assert provider._ring == "hermelinchat"  # lowercased folder name


def test_initialize_falls_back_to_os_getcwd_when_kwarg_missing(isolated_env, monkeypatch):
    """hermes's run_agent.py does NOT pass cwd to initialize_all (verified
    at run_agent.py:1199-1217). The plugin must fall back to os.getcwd()
    so ring scoping still works in the real hermes loop."""
    import os
    from plugins.memory.chorus import ChorusMemoryProvider

    monkeypatch.chdir(isolated_env)  # set CWD to tmp dir (basename = random)
    expected_ring = os.path.basename(str(isolated_env)).lower()

    provider = ChorusMemoryProvider()
    fake_client = MagicMock()
    fake_client.whoami.return_value = {"id": "x", "name": "y"}

    with patch("plugins.memory.chorus.ChorusClient", return_value=fake_client):
        provider.initialize("sess-1")  # no cwd kwarg

    assert provider._ring == expected_ring


def test_initialize_uses_default_ring_when_scope_by_cwd_disabled(isolated_env, monkeypatch):
    """When scope_by_cwd is off, default_ring wins — no auto-cwd inference."""
    from plugins.memory.chorus import ChorusMemoryProvider

    (isolated_env / "chorus.json").write_text(
        '{"default_ring": "core", "scope_by_cwd": false, "url": "http://localhost:3099"}'
    )
    monkeypatch.setenv("CHORUS_API_KEY", "sk-test")

    provider = ChorusMemoryProvider()
    fake_client = MagicMock()
    fake_client.whoami.return_value = {"id": "x", "name": "y"}

    with patch("plugins.memory.chorus.ChorusClient", return_value=fake_client):
        provider.initialize("sess-1")

    assert provider._ring == "core"


def test_initialize_explicit_cwd_kwarg_overrides_os_getcwd(isolated_env):
    """When hermes or tests do pass cwd explicitly, that wins over the fallback."""
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    fake_client = MagicMock()
    fake_client.whoami.return_value = {"id": "x", "name": "y"}

    with patch("plugins.memory.chorus.ChorusClient", return_value=fake_client):
        provider.initialize("sess-1", cwd="/home/inu/hermelinChat")

    assert provider._ring == "hermelinchat"


def test_is_available_stays_pure_no_network(isolated_env):
    """The availability check must not construct or call the HTTP client."""
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()

    with patch("plugins.memory.chorus.client.ChorusClient") as client_cls:
        result = provider.is_available()

    assert result is True  # isolated_env sets valid env vars
    client_cls.assert_not_called()
