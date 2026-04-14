"""Graph read/edit helpers on ``ChorusClient`` — graph, edges, update_edge, delete_edge.

All four are REST (GET/PATCH/DELETE) — the server does not expose them on /rpc.
"""

from __future__ import annotations

import json

import pytest


class _FakeResponse:
    def __init__(self, status=200, payload=None):
        self.status_code = status
        self._payload = payload
        self.text = json.dumps(payload) if payload is not None else ""

    def json(self):
        return self._payload


class _FakeSession:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def request(self, method, url, json=None, headers=None, timeout=None):
        self.calls.append({"method": method, "url": url, "json": json, "headers": dict(headers or {})})
        return self._responses.pop(0)

    # Back-compat aliases so existing _post-based tests keep working.
    def post(self, url, json=None, headers=None, timeout=None):
        return self.request("POST", url, json=json, headers=headers, timeout=timeout)


def _client(responses):
    from plugins.memory.chorus.client import ChorusClient, ChorusClientConfig

    cfg = ChorusClientConfig(url="http://localhost:3099", api_key="sk-test", identity_name="h")
    return ChorusClient(cfg, session=_FakeSession(responses))


def _rest_ok(data):
    return _FakeResponse(200, {"data": data})


# ---------------------------------------------------------------------------
# memory_graph (GET)
# ---------------------------------------------------------------------------


def test_memory_graph_uses_get_on_correct_path():
    c = _client([_rest_ok({"memories": [{"id": "memory:b", "edge": {"relation_type": "derives_from"}}]})])

    result = c.memory_graph(memory_id="memory:a")

    call = c._session.calls[0]
    assert call["method"] == "GET"
    assert call["url"].endswith("/memory/graph/memory%3Aa")
    assert call["json"] is None
    assert result == {"memories": [{"id": "memory:b", "edge": {"relation_type": "derives_from"}}]}


# ---------------------------------------------------------------------------
# memory_edges (GET)
# ---------------------------------------------------------------------------


def test_memory_edges_uses_get_on_correct_path():
    c = _client([_rest_ok({"edges": [{"id": "relates_to:x"}]})])

    result = c.memory_edges(memory_id="memory:a")

    call = c._session.calls[0]
    assert call["method"] == "GET"
    assert call["url"].endswith("/memory/relate/memory%3Aa/edges")
    assert result == {"edges": [{"id": "relates_to:x"}]}


# ---------------------------------------------------------------------------
# memory_update_edge (PATCH)
# ---------------------------------------------------------------------------


def test_memory_update_edge_uses_patch_with_body():
    c = _client([_rest_ok({"id": "relates_to:x", "strength": 0.9})])

    result = c.memory_update_edge(
        edge_id="relates_to:x", strength=0.9, metadata={"confirmed": True},
    )

    call = c._session.calls[0]
    assert call["method"] == "PATCH"
    assert call["url"].endswith("/memory/relate/relates_to%3Ax")
    assert call["json"] == {"strength": 0.9, "metadata": {"confirmed": True}}
    assert result == {"id": "relates_to:x", "strength": 0.9}


def test_memory_update_edge_omits_none_fields():
    c = _client([_rest_ok({"id": "relates_to:x"})])

    c.memory_update_edge(edge_id="relates_to:x", strength=0.5)

    body = c._session.calls[0]["json"]
    assert "strength" in body
    assert "metadata" not in body


# ---------------------------------------------------------------------------
# memory_delete_edge (DELETE)
# ---------------------------------------------------------------------------


def test_memory_delete_edge_uses_delete_verb():
    c = _client([_rest_ok({"deleted": True})])

    result = c.memory_delete_edge(edge_id="relates_to:x")

    call = c._session.calls[0]
    assert call["method"] == "DELETE"
    assert call["url"].endswith("/memory/relate/relates_to%3Ax")
    assert call["json"] is None
    assert result == {"deleted": True}
