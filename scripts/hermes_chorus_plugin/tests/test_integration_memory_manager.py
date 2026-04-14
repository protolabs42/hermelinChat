"""Full-loop integration: hermes MemoryManager ↔ our plugin ↔ live Chorus.

Mirrors what ``run_agent.py`` does during hermes startup (lines 1192–1217):

  1. ``load_memory_provider("chorus")`` — loader resolves our plugin.
  2. ``MemoryManager().add_provider(provider)`` — registers it.
  3. ``manager.initialize_all(...)`` — drives whoami probe against the tunnel.
  4. ``manager.build_system_prompt()`` — pulls ring memory into the prompt.
  5. ``manager.get_all_tool_schemas()`` — registers memory tools with hermes.
  6. ``manager.handle_tool_call(...)`` — routes store/query/update/forget.
  7. ``manager.prefetch_all()`` / ``queue_prefetch_all()`` — per-turn hooks.
  8. ``manager.on_memory_write(...)`` — built-in memory tool mirror.
  9. ``manager.on_pre_compress(...)`` — compression-boundary extraction.
 10. ``manager.on_session_end(...)`` — final signal + briefing memory.
 11. ``manager.shutdown_all()`` — clean teardown.

Every step here is exercised against the real tunnel with a real api_key.
If this test passes, the plugin is genuinely "Chorus as memory provider
for hermes" — not a mock, not a lookalike.

Gated behind ``CHORUS_INTEGRATION_TESTS=1`` + ``CHORUS_INTEGRATION_API_KEY``.
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
def manager_env(monkeypatch, tmp_path):
    """Isolated HERMES_HOME + live Chorus credentials."""
    for key in ("CHORUS_URL", "CHORUS_API_KEY", "CHORUS_IDENTITY_NAME", "CHORUS_RECALL_MODE"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("CHORUS_URL", _CHORUS_URL)
    monkeypatch.setenv("CHORUS_API_KEY", _API_KEY)
    return tmp_path


@pytest.fixture
def live_manager(manager_env):
    """A real MemoryManager with our chorus plugin loaded end-to-end."""
    from agent.memory_manager import MemoryManager
    from plugins.memory import load_memory_provider

    provider = load_memory_provider("chorus")
    assert provider is not None, "hermes loader did not find the chorus plugin"

    manager = MemoryManager()
    assert provider.is_available(), "plugin reports not available despite valid env"
    manager.add_provider(provider)

    # Exactly the kwargs run_agent.py passes.
    manager.initialize_all(
        session_id="loop-verify-session",
        platform="cli",
        agent_context="primary",
        cwd="/home/inu/hermelinChat",
    )

    yield manager

    manager.shutdown_all()


# ---------------------------------------------------------------------------
# Registration / discovery
# ---------------------------------------------------------------------------


def test_manager_registers_chorus_as_external_provider(live_manager):
    names = [p.name for p in live_manager.providers]
    assert "chorus" in names


def test_manager_exposes_chorus_memory_tools(live_manager):
    tool_names = {s["name"] for s in live_manager.get_all_tool_schemas()}
    assert "chorus_memory_store" in tool_names
    assert "chorus_memory_query" in tool_names
    assert "chorus_memory_recall" in tool_names
    assert "chorus_memory_update" in tool_names
    assert "chorus_memory_forget" in tool_names
    assert "chorus_memory_relate" in tool_names


def test_manager_routes_tool_names_to_chorus(live_manager):
    for tool in (
        "chorus_memory_store", "chorus_memory_query", "chorus_memory_recall",
        "chorus_memory_update", "chorus_memory_forget", "chorus_memory_relate",
    ):
        assert live_manager.has_tool(tool)


# ---------------------------------------------------------------------------
# System prompt + per-turn loop
# ---------------------------------------------------------------------------


def test_manager_build_system_prompt_includes_chorus_block(live_manager):
    prompt = live_manager.build_system_prompt()
    assert prompt
    assert "Chorus Memory" in prompt, f"no Chorus block in prompt:\n{prompt[:500]}"


def test_manager_full_per_turn_cycle(live_manager):
    """on_turn_start → prefetch_all → queue_prefetch_all → sync_all."""
    live_manager.on_turn_start(1, "what do we know about the plugin?")

    # Before any queue_prefetch has run, prefetch_all returns empty.
    _ = live_manager.prefetch_all("what do we know about the plugin?")

    # Kick a background query and give it a moment to resolve.
    live_manager.queue_prefetch_all("chorus hermes plugin rollout")
    # Drain bg thread.
    chorus = live_manager.get_provider("chorus")
    if chorus and chorus._prefetch_thread:
        chorus._prefetch_thread.join(timeout=5.0)

    injected = live_manager.prefetch_all("chorus hermes plugin rollout")
    assert isinstance(injected, str)  # may be empty if no matches; must not crash

    # Finally, sync the completed turn — must not raise.
    live_manager.sync_all(
        "what do we know about the plugin?",
        "The chorus plugin is a hermes memory provider …",
    )


# ---------------------------------------------------------------------------
# Tool dispatch via the manager
# ---------------------------------------------------------------------------


def test_manager_store_then_forget_via_tools(live_manager):
    tag = f"loop-verify-{uuid.uuid4().hex[:8]}"

    store_raw = live_manager.handle_tool_call("chorus_memory_store", {
        "content": f"loop verification marker {tag}",
        "entity": "loop-verification",
        "category": "integration-test",
        "tags": ["loop-verify", tag],
        "memory_type": "episodic",
    })
    store_body = json.loads(store_raw)
    memory_id = store_body.get("result", {}).get("id")
    assert memory_id, f"store via manager did not return an id: {store_body}"

    # Read back via the manager-routed tool, not the raw client.
    found = False
    deadline = time.time() + 5.0
    while time.time() < deadline and not found:
        query_raw = live_manager.handle_tool_call("chorus_memory_query", {
            "query": f"loop verification marker {tag}",
            "tags": [tag], "limit": 5,
        })
        query_body = json.loads(query_raw)
        memories = query_body.get("result", {}).get("memories", [])
        found = any(m.get("id") == memory_id for m in memories)
        if not found:
            time.sleep(0.3)

    assert found, f"manager-routed query did not return the memory we stored"

    # Cleanup via the forget tool — the whole round-trip is dogfooded.
    forget_raw = live_manager.handle_tool_call("chorus_memory_forget", {
        "memory_id": memory_id,
    })
    forget_body = json.loads(forget_raw)
    # Server returns the deleted memory object; surface it as result.
    assert "error" not in forget_body, f"forget failed: {forget_body}"
    assert forget_body.get("result") is not None

    # Prove the memory really is gone — a second forget should error.
    from plugins.memory.chorus.client import ChorusError  # noqa: F401
    second = live_manager.handle_tool_call(
        "chorus_memory_forget", {"memory_id": memory_id},
    )
    assert "error" in json.loads(second), "forget twice should surface an error"


# ---------------------------------------------------------------------------
# on_memory_write + on_pre_compress + on_session_end
# ---------------------------------------------------------------------------


def test_manager_on_memory_write_mirrors_to_chorus(live_manager):
    """Simulate the built-in memory tool writing; expect a Chorus mirror."""
    tag = f"mirror-verify-{uuid.uuid4().hex[:8]}"

    # Ask the manager to notify external providers of a built-in write.
    live_manager.on_memory_write("add", "user", f"user prefers X — {tag}")

    # The mirror runs in a daemon thread; wait for it to finish.
    chorus = live_manager.get_provider("chorus")
    if chorus and chorus._sync_thread:
        chorus._sync_thread.join(timeout=5.0)

    # Verify via recall. The mirrored memory lands under entity=ring name.
    recall_raw = live_manager.handle_tool_call("chorus_memory_recall", {
        "entity": "hermelinchat",
    })
    recall_body = json.loads(recall_raw)
    memories = recall_body.get("result", {}).get("memories", [])
    matched = [m for m in memories if tag in (m.get("content") or "")]
    assert matched, "on_memory_write mirror did not land in Chorus"
    mirror = matched[0]
    assert "hermes-mirror" in (mirror.get("tags") or [])
    # Clean up so we don't pollute the ring.
    live_manager.handle_tool_call("chorus_memory_forget", {
        "memory_id": mirror["id"],
    })


def test_manager_relate_via_tool_dispatch(live_manager):
    """Full provider path: two stores → relate via tool → inspect edge → cleanup."""
    import uuid

    tag = f"relate-loop-{uuid.uuid4().hex[:8]}"

    store_a_raw = live_manager.handle_tool_call("chorus_memory_store", {
        "content": f"relate loop A {tag}", "entity": "relate-loop-verify",
        "category": "integration-test", "tags": [tag, "loop-a"],
        "memory_type": "semantic",
    })
    store_b_raw = live_manager.handle_tool_call("chorus_memory_store", {
        "content": f"relate loop B {tag}", "entity": "relate-loop-verify",
        "category": "integration-test", "tags": [tag, "loop-b"],
        "memory_type": "semantic",
    })
    aid = json.loads(store_a_raw)["result"]["id"]
    bid = json.loads(store_b_raw)["result"]["id"]

    try:
        relate_raw = live_manager.handle_tool_call("chorus_memory_relate", {
            "from_memory": aid, "to_memory": bid,
            "relation_type": "derives_from",
        })
        body = json.loads(relate_raw)
        assert "error" not in body, f"relate via tool failed: {body}"
        rel = body["result"]
        assert rel["id"].startswith("relates_to:")
        assert rel["in"] == aid and rel["out"] == bid
        assert rel["relation_type"] == "derives_from"
    finally:
        live_manager.handle_tool_call("chorus_memory_forget", {"memory_id": aid})
        live_manager.handle_tool_call("chorus_memory_forget", {"memory_id": bid})


def test_manager_on_pre_compress_returns_summary(live_manager):
    summary = live_manager.on_pre_compress([
        {"role": "user", "content": "important fact we should not lose"},
        {"role": "assistant", "content": "acknowledged"},
    ])
    assert isinstance(summary, str)


def test_manager_on_session_end_noops_cleanly(live_manager):
    """No turns happened in this test — on_session_end should be a safe noop."""
    live_manager.on_session_end([])  # must not raise
