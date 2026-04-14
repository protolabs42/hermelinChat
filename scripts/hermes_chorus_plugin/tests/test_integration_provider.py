"""Live provider end-to-end: initialize → system_prompt_block → handle_tool_call.

Exercises the full MemoryProvider surface against the real tunnel using
a real api_key. Gated behind ``CHORUS_INTEGRATION_TESTS=1`` +
``CHORUS_INTEGRATION_API_KEY``.
"""

from __future__ import annotations

import json
import os
import time
import uuid

import pytest


_CHORUS_URL = os.environ.get("CHORUS_INTEGRATION_URL", "http://localhost:3099")
_API_KEY = os.environ.get("CHORUS_INTEGRATION_API_KEY", "")
_INTEGRATION = os.environ.get("CHORUS_INTEGRATION_TESTS") == "1"


pytestmark = pytest.mark.skipif(
    not _INTEGRATION or not _API_KEY,
    reason="CHORUS_INTEGRATION_TESTS=1 + CHORUS_INTEGRATION_API_KEY required",
)


@pytest.fixture
def isolated_env(monkeypatch, tmp_path):
    for key in (
        "CHORUS_URL", "CHORUS_API_KEY", "CHORUS_IDENTITY_NAME", "CHORUS_RECALL_MODE",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("CHORUS_URL", _CHORUS_URL)
    monkeypatch.setenv("CHORUS_API_KEY", _API_KEY)
    monkeypatch.setenv("CHORUS_IDENTITY_NAME", "hermes-plugin-verification")
    return tmp_path


def _wait_for_thread(provider, attr, timeout=5.0):
    t = getattr(provider, attr, None)
    if t is not None and t.is_alive():
        t.join(timeout=timeout)


def test_provider_initialize_against_live_tunnel(isolated_env):
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    provider.initialize("verify-session-1", cwd="/home/inu/hermelinChat")

    assert provider._inactive_reason is None
    assert provider._identity is not None
    assert provider._identity.get("id", "").startswith("identity:")


def test_system_prompt_block_fetches_live_ring_memory(isolated_env):
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    provider.initialize("verify-session-2", cwd="/home/inu/hermelinChat")

    block = provider.system_prompt_block()
    assert block  # ring has real memories, so we expect something
    assert "Chorus Memory" in block
    # Cached on second call.
    assert provider.system_prompt_block() == block


def test_live_store_then_query_tool_roundtrip(isolated_env):
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    provider.initialize("verify-session-3", cwd="/home/inu/hermelinChat")

    test_tag = f"verify-provider-{uuid.uuid4().hex[:8]}"
    unique_content = f"live provider tool test {test_tag}"

    raw = provider.handle_tool_call("chorus_memory_store", {
        "content": unique_content,
        "entity": "hermes-plugin-verification",
        "category": "integration-test",
        "tags": ["hermes-plugin-verification", test_tag],
        "memory_type": "episodic",
    })
    body = json.loads(raw)
    assert body.get("result", {}).get("id"), f"store failed: {body}"

    # Eventually consistent — query until we find it (≤5s).
    found = False
    deadline = time.time() + 5.0
    while time.time() < deadline and not found:
        raw = provider.handle_tool_call("chorus_memory_query", {
            "query": unique_content, "limit": 5, "tags": [test_tag],
        })
        body = json.loads(raw)
        memories = body.get("result", {}).get("memories", [])
        found = any(test_tag in (m.get("tags") or []) for m in memories)
        if not found:
            time.sleep(0.3)

    assert found, f"query did not find our stored memory for {test_tag}"


def test_live_queue_prefetch_populates_slot(isolated_env):
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    provider.initialize("verify-session-4", cwd="/home/inu/hermelinChat")

    provider.queue_prefetch("chorus plugin development")
    _wait_for_thread(provider, "_prefetch_thread", timeout=5.0)

    injected = provider.prefetch("chorus plugin development")
    # Ring has real memory so we should have gotten something.
    assert isinstance(injected, str)
