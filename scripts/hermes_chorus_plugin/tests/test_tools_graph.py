"""Tool schema + dispatch for the four graph read/edit tools."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def isolated_env(monkeypatch, tmp_path):
    for key in ("CHORUS_URL", "CHORUS_API_KEY", "CHORUS_IDENTITY_NAME", "CHORUS_RECALL_MODE"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("CHORUS_URL", "http://localhost:3099")
    monkeypatch.setenv("CHORUS_API_KEY", "sk-test")
    return tmp_path


def _active_provider():
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    fake_client = MagicMock()
    fake_client.whoami.return_value = {"id": "x", "name": "t"}
    with patch("plugins.memory.chorus.ChorusClient", return_value=fake_client):
        provider.initialize("s", cwd="/home/inu/hermelinChat")
    provider._client = fake_client
    return provider, fake_client


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


def test_graph_tools_exposed_in_hybrid_mode(isolated_env):
    provider, _ = _active_provider()
    names = {s["name"] for s in provider.get_tool_schemas()}
    assert {
        "chorus_memory_graph",
        "chorus_memory_edges",
        "chorus_memory_update_edge",
        "chorus_memory_delete_edge",
    } <= names


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


def test_graph_dispatches(isolated_env):
    provider, client = _active_provider()
    client.memory_graph.return_value = {"memories": []}

    raw = provider.handle_tool_call("chorus_memory_graph", {"memory_id": "memory:a"})

    client.memory_graph.assert_called_once_with(memory_id="memory:a")
    body = json.loads(raw)
    assert body["result"] == {"memories": []}


def test_graph_rejects_missing_memory_id(isolated_env):
    provider, client = _active_provider()

    raw = provider.handle_tool_call("chorus_memory_graph", {})

    client.memory_graph.assert_not_called()
    body = json.loads(raw)
    assert "error" in body


def test_edges_dispatches(isolated_env):
    provider, client = _active_provider()
    client.memory_edges.return_value = {"edges": []}

    raw = provider.handle_tool_call("chorus_memory_edges", {"memory_id": "memory:a"})

    client.memory_edges.assert_called_once_with(memory_id="memory:a")
    body = json.loads(raw)
    assert body["result"] == {"edges": []}


def test_update_edge_dispatches_with_fields(isolated_env):
    provider, client = _active_provider()
    client.memory_update_edge.return_value = {"id": "relates_to:x", "strength": 0.95}

    raw = provider.handle_tool_call("chorus_memory_update_edge", {
        "edge_id": "relates_to:x",
        "strength": 0.95,
        "metadata": {"validated": True},
    })

    client.memory_update_edge.assert_called_once()
    call_kwargs = client.memory_update_edge.call_args.kwargs
    assert call_kwargs["edge_id"] == "relates_to:x"
    assert call_kwargs["strength"] == 0.95
    assert call_kwargs["metadata"] == {"validated": True}


def test_update_edge_rejects_empty_update_set(isolated_env):
    provider, client = _active_provider()

    raw = provider.handle_tool_call("chorus_memory_update_edge", {"edge_id": "relates_to:x"})

    client.memory_update_edge.assert_not_called()
    body = json.loads(raw)
    assert "error" in body


def test_update_edge_clamps_strength(isolated_env):
    provider, client = _active_provider()
    client.memory_update_edge.return_value = {}

    provider.handle_tool_call("chorus_memory_update_edge", {
        "edge_id": "relates_to:x",
        "strength": 2.5,  # out of range
    })

    call_kwargs = client.memory_update_edge.call_args.kwargs
    assert call_kwargs["strength"] == 1.0  # clamped


def test_delete_edge_dispatches(isolated_env):
    provider, client = _active_provider()
    client.memory_delete_edge.return_value = {"deleted": True}

    raw = provider.handle_tool_call("chorus_memory_delete_edge", {"edge_id": "relates_to:x"})

    client.memory_delete_edge.assert_called_once_with(edge_id="relates_to:x")
    body = json.loads(raw)
    assert body["result"] == {"deleted": True}


def test_delete_edge_rejects_missing_id(isolated_env):
    provider, client = _active_provider()

    raw = provider.handle_tool_call("chorus_memory_delete_edge", {})

    client.memory_delete_edge.assert_not_called()
    body = json.loads(raw)
    assert "error" in body
