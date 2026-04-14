"""Lifecycle hooks: sync_turn, on_session_end, on_pre_compress, on_memory_write.

Covers the full opt-in matrix (emit_signals, sync_turn_emit) plus the
graceful-degradation semantics when a permission error comes back from
``signal/emit``.
"""

from __future__ import annotations

import time
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


def _active_provider(emit_signals=False, sync_turn_emit="session-end"):
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    fake_client = MagicMock()
    fake_client.whoami.return_value = {"id": "x", "name": "hermes-test"}
    fake_client.memory_query.return_value = {"memories": []}
    fake_client.memory_store.return_value = {"id": "memory:new"}
    fake_client.signal_emit.return_value = {"id": "signal:new"}

    with patch("plugins.memory.chorus.ChorusClient", return_value=fake_client):
        provider.initialize("sess-abc", cwd="/home/inu/hermelinChat")

    provider._client = fake_client
    provider._config.emit_signals = emit_signals
    provider._config.sync_turn_emit = sync_turn_emit
    return provider, fake_client


def _wait_for_threads(provider, timeout=2.0):
    """Drain both sync and prefetch daemon threads."""
    for attr in ("_sync_thread", "_prefetch_thread"):
        t = getattr(provider, attr, None)
        if t is not None and t.is_alive():
            t.join(timeout=timeout)


# ---------------------------------------------------------------------------
# sync_turn
# ---------------------------------------------------------------------------


def test_sync_turn_noop_when_emit_signals_false(isolated_env):
    provider, client = _active_provider(emit_signals=False, sync_turn_emit="every-turn")

    provider.sync_turn("user msg", "assistant reply")
    _wait_for_threads(provider)

    client.signal_emit.assert_not_called()


def test_sync_turn_noop_when_sync_turn_emit_never(isolated_env):
    provider, client = _active_provider(emit_signals=True, sync_turn_emit="never")

    provider.sync_turn("user msg", "assistant reply")
    _wait_for_threads(provider)

    client.signal_emit.assert_not_called()


def test_sync_turn_emits_pulse_on_every_turn(isolated_env):
    provider, client = _active_provider(emit_signals=True, sync_turn_emit="every-turn")

    provider.sync_turn("q", "a")
    _wait_for_threads(provider)

    client.signal_emit.assert_called_once()
    call_kwargs = client.signal_emit.call_args.kwargs
    assert call_kwargs.get("stream_type") == "pulse"


def test_sync_turn_accumulates_on_session_end_mode(isolated_env):
    provider, client = _active_provider(emit_signals=True, sync_turn_emit="session-end")

    provider.sync_turn("q", "a")
    provider.sync_turn("q2", "a2")
    _wait_for_threads(provider)

    # Nothing emitted mid-session.
    client.signal_emit.assert_not_called()
    # But turns are accumulated.
    assert len(provider._pending_turns) == 2


def test_sync_turn_permission_error_disables_signals(isolated_env, caplog):
    import logging
    from plugins.memory.chorus.client import ChorusPermissionError

    provider, client = _active_provider(emit_signals=True, sync_turn_emit="every-turn")
    client.signal_emit.side_effect = ChorusPermissionError("role not held")

    with caplog.at_level(logging.WARNING, logger="plugins.memory.chorus"):
        provider.sync_turn("q", "a")
        _wait_for_threads(provider)

    # Further emissions should be short-circuited.
    client.signal_emit.reset_mock()
    provider.sync_turn("q2", "a2")
    _wait_for_threads(provider)
    client.signal_emit.assert_not_called()
    assert provider._config.emit_signals is False  # degraded


# ---------------------------------------------------------------------------
# on_session_end
# ---------------------------------------------------------------------------


def test_on_session_end_emits_sense_and_stores_briefing(isolated_env):
    provider, client = _active_provider(emit_signals=True, sync_turn_emit="session-end")

    provider.sync_turn("q", "a")
    provider.sync_turn("q2", "a2")
    provider.on_session_end([
        {"role": "user", "content": "q"},
        {"role": "assistant", "content": "a"},
    ])

    _wait_for_threads(provider)

    # One sense signal summarizing the session
    client.signal_emit.assert_called()
    stream_types = [c.kwargs.get("stream_type") for c in client.signal_emit.call_args_list]
    assert "sense" in stream_types

    # One briefing memory stored
    client.memory_store.assert_called()
    mem_kwargs = client.memory_store.call_args.kwargs
    assert "category" in mem_kwargs
    assert "resumption" in mem_kwargs["category"].lower() or "session" in mem_kwargs["category"].lower()


def test_on_session_end_noop_when_nothing_happened(isolated_env):
    provider, client = _active_provider(emit_signals=True, sync_turn_emit="session-end")

    provider.on_session_end([])
    _wait_for_threads(provider)

    client.signal_emit.assert_not_called()
    client.memory_store.assert_not_called()


def test_on_session_end_when_signals_disabled_still_stores_memory(isolated_env):
    provider, client = _active_provider(emit_signals=False)

    provider.sync_turn("q", "a")
    provider.on_session_end([{"role": "user", "content": "q"}, {"role": "assistant", "content": "a"}])
    _wait_for_threads(provider)

    client.signal_emit.assert_not_called()
    client.memory_store.assert_called()


def test_on_session_end_noop_when_inactive(isolated_env, monkeypatch):
    monkeypatch.delenv("CHORUS_API_KEY", raising=False)
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    provider.initialize("s")
    provider.on_session_end([])  # must not raise


# ---------------------------------------------------------------------------
# on_pre_compress
# ---------------------------------------------------------------------------


def test_on_pre_compress_returns_string(isolated_env):
    provider, client = _active_provider()

    summary = provider.on_pre_compress([
        {"role": "user", "content": "user msg 1"},
        {"role": "assistant", "content": "assistant reply 1"},
        {"role": "user", "content": "user msg 2"},
    ])

    assert isinstance(summary, str)


def test_on_pre_compress_stores_insight_memory(isolated_env):
    provider, client = _active_provider()

    provider.on_pre_compress([
        {"role": "user", "content": "important fact about project"},
        {"role": "assistant", "content": "acknowledged, will remember"},
    ])
    _wait_for_threads(provider)

    client.memory_store.assert_called()
    mem_kwargs = client.memory_store.call_args.kwargs
    assert mem_kwargs.get("memory_type") == "episodic"


def test_on_pre_compress_noop_when_inactive(isolated_env, monkeypatch):
    monkeypatch.delenv("CHORUS_API_KEY", raising=False)
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    provider.initialize("s")

    assert provider.on_pre_compress([]) == ""


# ---------------------------------------------------------------------------
# on_memory_write
# ---------------------------------------------------------------------------


def test_on_memory_write_mirrors_add_actions(isolated_env):
    provider, client = _active_provider()

    provider.on_memory_write("add", "user", "user prefers short replies")
    _wait_for_threads(provider)

    client.memory_store.assert_called_once()
    mem_kwargs = client.memory_store.call_args.kwargs
    assert "user prefers short replies" in mem_kwargs["content"]
    assert "hermes-mirror" in mem_kwargs["tags"]


def test_on_memory_write_ignores_remove(isolated_env):
    provider, client = _active_provider()

    provider.on_memory_write("remove", "user", "delete me")
    _wait_for_threads(provider)

    client.memory_store.assert_not_called()


def test_on_memory_write_ignores_empty_content(isolated_env):
    provider, client = _active_provider()

    provider.on_memory_write("add", "user", "")
    _wait_for_threads(provider)

    client.memory_store.assert_not_called()


def test_on_memory_write_noop_when_inactive(isolated_env, monkeypatch):
    monkeypatch.delenv("CHORUS_API_KEY", raising=False)
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    provider.initialize("s")
    provider.on_memory_write("add", "user", "x")  # must not raise
