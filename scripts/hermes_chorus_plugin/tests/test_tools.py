"""Tool schema exposure and ``handle_tool_call`` dispatch.

Covers:
  * Schema list filtered by recall_mode (hybrid|tools|context).
  * Dispatch of the three memory tools to the right RPC methods.
  * Required-param validation with tool_error.
  * Dispatch short-circuits when the provider is cron-skipped or inactive.
"""

from __future__ import annotations

import json
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


def _active_provider():
    """Return an initialized provider with a fake client injected."""
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    fake_client = MagicMock()
    fake_client.whoami.return_value = {"id": "x", "name": "hermes-test"}
    with patch("plugins.memory.chorus.ChorusClient", return_value=fake_client):
        provider.initialize("sess-1", cwd="/home/inu/hermelinChat")
    provider._client = fake_client
    return provider, fake_client


# ---------------------------------------------------------------------------
# Schema exposure
# ---------------------------------------------------------------------------


def test_schemas_exposed_in_hybrid_mode(isolated_env):
    provider, _ = _active_provider()
    provider._config.recall_mode = "hybrid"

    schemas = provider.get_tool_schemas()
    names = {s["name"] for s in schemas}
    assert {"chorus_memory_store", "chorus_memory_query", "chorus_memory_recall"} <= names


def test_schemas_exposed_in_tools_mode(isolated_env):
    provider, _ = _active_provider()
    provider._config.recall_mode = "tools"

    schemas = provider.get_tool_schemas()
    names = {s["name"] for s in schemas}
    assert "chorus_memory_store" in names


def test_schemas_hidden_in_context_mode(isolated_env):
    provider, _ = _active_provider()
    provider._config.recall_mode = "context"

    assert provider.get_tool_schemas() == []


def test_schemas_hidden_when_inactive(isolated_env, monkeypatch):
    monkeypatch.delenv("CHORUS_API_KEY", raising=False)

    from plugins.memory.chorus import ChorusMemoryProvider
    provider = ChorusMemoryProvider()
    provider.initialize("s")

    assert provider.get_tool_schemas() == []


def test_schema_shapes_are_openai_function_format(isolated_env):
    provider, _ = _active_provider()
    for schema in provider.get_tool_schemas():
        assert "name" in schema
        assert "description" in schema and schema["description"]
        assert "parameters" in schema
        assert schema["parameters"]["type"] == "object"
        assert "properties" in schema["parameters"]


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


def test_store_dispatches_to_client_and_returns_result(isolated_env):
    provider, client = _active_provider()
    client.memory_store.return_value = {"id": "memory:new"}

    raw = provider.handle_tool_call("chorus_memory_store", {
        "content": "hello",
        "entity": "test-entity",
        "category": "semantic",
    })

    client.memory_store.assert_called_once()
    call_kwargs = client.memory_store.call_args.kwargs
    assert call_kwargs["content"] == "hello"
    assert call_kwargs["entity"] == "test-entity"

    body = json.loads(raw)
    assert body.get("result", {}).get("id") == "memory:new"


def test_query_dispatches_to_client_and_returns_result(isolated_env):
    provider, client = _active_provider()
    client.memory_query.return_value = {"memories": [{"id": "m1"}]}

    raw = provider.handle_tool_call("chorus_memory_query", {
        "query": "what",
        "limit": 3,
    })

    client.memory_query.assert_called_once()
    body = json.loads(raw)
    assert body["result"]["memories"] == [{"id": "m1"}]


def test_recall_dispatches_to_client(isolated_env):
    provider, client = _active_provider()
    client.memory_recall.return_value = {"memories": []}

    provider.handle_tool_call("chorus_memory_recall", {"entity": "sophie"})

    client.memory_recall.assert_called_once_with(entity="sophie")


def test_store_rejects_missing_content(isolated_env):
    provider, client = _active_provider()

    raw = provider.handle_tool_call("chorus_memory_store", {})

    client.memory_store.assert_not_called()
    body = json.loads(raw)
    assert "error" in body
    assert "content" in body["error"].lower()


def test_query_rejects_missing_query(isolated_env):
    provider, client = _active_provider()

    raw = provider.handle_tool_call("chorus_memory_query", {})

    client.memory_query.assert_not_called()
    body = json.loads(raw)
    assert "error" in body


def test_recall_rejects_missing_entity(isolated_env):
    provider, client = _active_provider()

    raw = provider.handle_tool_call("chorus_memory_recall", {})

    client.memory_recall.assert_not_called()
    body = json.loads(raw)
    assert "error" in body


def test_unknown_tool_returns_tool_error(isolated_env):
    provider, _ = _active_provider()

    raw = provider.handle_tool_call("not_a_chorus_tool", {})
    body = json.loads(raw)
    assert "error" in body


def test_dispatch_returns_error_when_inactive(isolated_env, monkeypatch):
    monkeypatch.delenv("CHORUS_API_KEY", raising=False)
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    provider.initialize("s")  # no api_key → inactive

    raw = provider.handle_tool_call("chorus_memory_store", {"content": "x"})
    body = json.loads(raw)
    assert "error" in body


def test_dispatch_maps_client_errors_to_tool_error(isolated_env):
    from plugins.memory.chorus.client import ChorusError

    provider, client = _active_provider()
    client.memory_store.side_effect = ChorusError("kaboom")

    raw = provider.handle_tool_call("chorus_memory_store", {"content": "x"})

    body = json.loads(raw)
    assert "error" in body
    assert "kaboom" in body["error"]
