"""System-prompt injection + background prefetch.

Covers:
  * First-turn system-prompt block baking (fetch once, cache after).
  * recall_mode gating (``tools`` mode returns empty injection).
  * Graceful degradation when ``memory/query`` fails.
  * ``prefetch`` returns cached background result, drains slot.
  * Token budget truncation for large prefetch payloads.
  * ``queue_prefetch`` fires a daemon thread that populates the slot.
"""

from __future__ import annotations

import threading
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


def _active_provider(recall_mode="hybrid", ring="hermelinchat", memories=None):
    """Provider with a fake client, initialized and ready to exercise hooks."""
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    fake_client = MagicMock()
    fake_client.whoami.return_value = {"id": "x", "name": "hermes-test"}
    if memories is not None:
        fake_client.memory_query.return_value = {"memories": memories}
    else:
        fake_client.memory_query.return_value = {"memories": []}

    with patch("plugins.memory.chorus.ChorusClient", return_value=fake_client):
        provider.initialize("sess-1", cwd=f"/home/inu/{ring}")

    provider._client = fake_client
    provider._config.recall_mode = recall_mode
    return provider, fake_client


# ---------------------------------------------------------------------------
# system_prompt_block
# ---------------------------------------------------------------------------


def test_system_prompt_block_empty_when_inactive(isolated_env, monkeypatch):
    monkeypatch.delenv("CHORUS_API_KEY", raising=False)
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    provider.initialize("s")

    assert provider.system_prompt_block() == ""


def test_system_prompt_block_empty_in_tools_mode(isolated_env):
    provider, _ = _active_provider(recall_mode="tools")

    assert provider.system_prompt_block() == ""


def test_system_prompt_block_first_call_fetches_and_caches(isolated_env):
    provider, client = _active_provider(memories=[
        {"content": "user prefers ACP over PTY", "tags": ["aurora"], "category": "preference"},
        {"content": "chorus tunnel on localhost:3099", "tags": ["deployment"], "category": "config"},
    ])

    block1 = provider.system_prompt_block()
    assert block1
    assert "ACP" in block1 or "acp" in block1.lower()
    assert "tunnel" in block1.lower()
    assert client.memory_query.call_count == 1

    block2 = provider.system_prompt_block()
    assert block2 == block1
    # Still only one fetch — cached.
    assert client.memory_query.call_count == 1


def test_system_prompt_block_mentions_identity_and_ring(isolated_env):
    provider, _ = _active_provider(ring="hermelinchat", memories=[
        {"content": "ring-scoped memory", "tags": [], "category": "fact"},
    ])

    block = provider.system_prompt_block()
    assert "Chorus" in block
    assert "hermelinchat" in block.lower() or provider._identity["name"] in block


def test_system_prompt_block_handles_fetch_errors_silently(isolated_env, caplog):
    import logging
    from plugins.memory.chorus.client import ChorusError

    provider, client = _active_provider(memories=[])
    client.memory_query.side_effect = ChorusError("network blip")

    with caplog.at_level(logging.WARNING, logger="plugins.memory.chorus"):
        block = provider.system_prompt_block()

    # An error should never crash the hook. It may return empty or a header.
    assert isinstance(block, str)
    # And it should be cached so we don't hammer the server next turn.
    block2 = provider.system_prompt_block()
    assert block2 == block
    # Single fetch attempt even after error.
    assert client.memory_query.call_count == 1


def test_system_prompt_block_truncates_long_memories(isolated_env):
    big = "x" * 20000
    provider, _ = _active_provider(memories=[
        {"content": big, "tags": [], "category": "fact"},
    ])
    provider._config.context_tokens = 100

    block = provider.system_prompt_block()
    assert len(block) < 2000, f"block length {len(block)} exceeds sane bound for 100-token budget"


# ---------------------------------------------------------------------------
# prefetch + queue_prefetch
# ---------------------------------------------------------------------------


def test_prefetch_returns_empty_when_slot_empty(isolated_env):
    provider, _ = _active_provider()

    assert provider.prefetch("anything") == ""


def test_prefetch_returns_result_and_drains_slot(isolated_env):
    provider, _ = _active_provider()

    with provider._prefetch_lock:
        provider._prefetch_result = "ring memory x"

    result = provider.prefetch("anything")
    assert "ring memory x" in result

    # Slot is drained.
    assert provider.prefetch("anything") == ""


def test_prefetch_truncates_to_context_tokens_budget(isolated_env):
    provider, _ = _active_provider()
    provider._config.context_tokens = 50  # ~200 chars

    big = "x" * 5000
    with provider._prefetch_lock:
        provider._prefetch_result = big

    result = provider.prefetch("anything")
    assert len(result) < len(big)


def test_prefetch_empty_in_tools_mode(isolated_env):
    provider, _ = _active_provider(recall_mode="tools")

    with provider._prefetch_lock:
        provider._prefetch_result = "should not appear"

    assert provider.prefetch("anything") == ""


def test_queue_prefetch_spawns_thread_and_populates_slot(isolated_env):
    provider, client = _active_provider(memories=[
        {"content": "prefetched fact", "tags": [], "category": "info"},
    ])

    provider.queue_prefetch("tell me about X")

    # Wait for the daemon thread to complete (bounded).
    deadline = time.time() + 2.0
    while time.time() < deadline:
        with provider._prefetch_lock:
            if provider._prefetch_result:
                break
        time.sleep(0.01)

    with provider._prefetch_lock:
        assert "prefetched fact" in provider._prefetch_result


def test_queue_prefetch_noop_when_inactive(isolated_env, monkeypatch):
    monkeypatch.delenv("CHORUS_API_KEY", raising=False)
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    provider.initialize("s")
    # Should not raise or spawn anything.
    provider.queue_prefetch("hi")


def test_queue_prefetch_noop_in_tools_mode(isolated_env):
    provider, client = _active_provider(recall_mode="tools")

    provider.queue_prefetch("hi")

    # Let threads that weren't supposed to spawn settle.
    time.sleep(0.05)
    client.memory_query.assert_not_called()


def test_shutdown_joins_background_threads(isolated_env):
    provider, _ = _active_provider()

    finished = threading.Event()

    def slow_memory_query(**kwargs):
        time.sleep(0.1)
        finished.set()
        return {"memories": []}

    provider._client.memory_query.side_effect = slow_memory_query

    provider.queue_prefetch("hi")
    provider.shutdown()

    assert finished.is_set(), "shutdown returned before the background thread completed"
