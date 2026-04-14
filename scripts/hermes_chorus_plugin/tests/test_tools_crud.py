"""Tool dispatch for chorus_memory_update / chorus_memory_forget / chorus_memory_relate."""

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
    fake_client.whoami.return_value = {"id": "x", "name": "hermes-test"}
    with patch("plugins.memory.chorus.ChorusClient", return_value=fake_client):
        provider.initialize("s", cwd="/home/inu/hermelinChat")
    provider._client = fake_client
    return provider, fake_client


# ---------------------------------------------------------------------------
# Schema exposure
# ---------------------------------------------------------------------------


def test_crud_tools_exposed_in_hybrid_mode(isolated_env):
    provider, _ = _active_provider()
    provider._config.recall_mode = "hybrid"

    names = {s["name"] for s in provider.get_tool_schemas()}
    assert {"chorus_memory_update", "chorus_memory_forget", "chorus_memory_relate"} <= names


def test_relate_schema_declares_enum(isolated_env):
    provider, _ = _active_provider()

    relate = next(s for s in provider.get_tool_schemas() if s["name"] == "chorus_memory_relate")
    props = relate["parameters"]["properties"]
    assert "relation_type" in props
    assert set(props["relation_type"]["enum"]) == {
        "supports", "contradicts", "derives_from", "supersedes", "related_to"
    }


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


def test_update_dispatches_to_client(isolated_env):
    provider, client = _active_provider()
    client.memory_update.return_value = {"id": "memory:abc", "content": "new"}

    raw = provider.handle_tool_call("chorus_memory_update", {
        "memory_id": "memory:abc",
        "content": "new",
        "tags": ["refined"],
    })

    client.memory_update.assert_called_once()
    call_kwargs = client.memory_update.call_args.kwargs
    assert call_kwargs["memory_id"] == "memory:abc"
    assert call_kwargs["content"] == "new"
    assert call_kwargs["tags"] == ["refined"]

    body = json.loads(raw)
    assert body["result"]["id"] == "memory:abc"


def test_update_rejects_missing_memory_id(isolated_env):
    provider, client = _active_provider()

    raw = provider.handle_tool_call("chorus_memory_update", {"content": "x"})
    client.memory_update.assert_not_called()
    body = json.loads(raw)
    assert "error" in body
    assert "memory_id" in body["error"].lower()


def test_update_rejects_empty_update_set(isolated_env):
    """If no actual update field is supplied, don't waste an RPC."""
    provider, client = _active_provider()

    raw = provider.handle_tool_call("chorus_memory_update", {"memory_id": "memory:abc"})
    client.memory_update.assert_not_called()
    body = json.loads(raw)
    assert "error" in body


def test_forget_dispatches_to_client(isolated_env):
    provider, client = _active_provider()
    client.memory_forget.return_value = {"deleted": True}

    raw = provider.handle_tool_call("chorus_memory_forget", {"memory_id": "memory:xyz"})

    client.memory_forget.assert_called_once_with(memory_id="memory:xyz")
    body = json.loads(raw)
    assert body["result"]["deleted"] is True


def test_forget_rejects_missing_memory_id(isolated_env):
    provider, client = _active_provider()

    raw = provider.handle_tool_call("chorus_memory_forget", {})
    client.memory_forget.assert_not_called()
    body = json.loads(raw)
    assert "error" in body


def test_relate_dispatches_to_client(isolated_env):
    provider, client = _active_provider()
    client.memory_relate.return_value = {"id": "relation:abc"}

    raw = provider.handle_tool_call("chorus_memory_relate", {
        "from_memory": "memory:a",
        "to_memory": "memory:b",
        "relation_type": "derives_from",
    })

    client.memory_relate.assert_called_once()
    call_kwargs = client.memory_relate.call_args.kwargs
    assert call_kwargs["from_memory"] == "memory:a"
    assert call_kwargs["to_memory"] == "memory:b"
    assert call_kwargs["relation_type"] == "derives_from"


def test_relate_rejects_invalid_relation_type(isolated_env):
    provider, client = _active_provider()

    raw = provider.handle_tool_call("chorus_memory_relate", {
        "from_memory": "memory:a",
        "to_memory": "memory:b",
        "relation_type": "not-a-real-type",
    })
    client.memory_relate.assert_not_called()
    body = json.loads(raw)
    assert "error" in body


def test_relate_rejects_missing_fields(isolated_env):
    provider, client = _active_provider()

    raw = provider.handle_tool_call("chorus_memory_relate", {"from_memory": "memory:a"})
    client.memory_relate.assert_not_called()
    body = json.loads(raw)
    assert "error" in body
