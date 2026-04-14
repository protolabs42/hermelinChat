"""Memory update / forget / relate RPC helpers on ``ChorusClient``."""

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

    def post(self, url, json=None, headers=None, timeout=None):
        return self.request("POST", url, json=json, headers=headers, timeout=timeout)


def _client(responses):
    from plugins.memory.chorus.client import ChorusClient, ChorusClientConfig

    cfg = ChorusClientConfig(url="http://localhost:3099", api_key="sk-test", identity_name="h")
    return ChorusClient(cfg, session=_FakeSession(responses))


def _rpc_ok(result):
    return _FakeResponse(200, {"jsonrpc": "2.0", "id": 1, "result": result})


# ---------------------------------------------------------------------------
# memory_update
# ---------------------------------------------------------------------------


def test_memory_update_sends_memory_id_param():
    c = _client([_rpc_ok({"id": "memory:abc", "content": "updated"})])

    c.memory_update(memory_id="memory:abc", content="updated")

    call = c._session.calls[0]
    assert call["json"]["method"] == "memory/update"
    params = call["json"]["params"]
    assert params["memory_id"] == "memory:abc"
    assert params["content"] == "updated"


def test_memory_update_omits_none_fields():
    c = _client([_rpc_ok({"id": "memory:abc"})])

    c.memory_update(memory_id="memory:abc", content="only content")

    params = c._session.calls[0]["json"]["params"]
    assert "memory_id" in params
    assert "content" in params
    assert "tags" not in params
    assert "confidence" not in params


def test_memory_update_forwards_optional_fields():
    c = _client([_rpc_ok({"id": "memory:abc"})])

    c.memory_update(
        memory_id="memory:abc",
        content="new",
        tags=["updated"],
        category="refined",
        confidence=0.95,
    )

    params = c._session.calls[0]["json"]["params"]
    assert params["content"] == "new"
    assert params["tags"] == ["updated"]
    assert params["category"] == "refined"
    assert params["confidence"] == 0.95


# ---------------------------------------------------------------------------
# memory_forget
# ---------------------------------------------------------------------------


def test_memory_forget_sends_memory_id_param():
    c = _client([_rpc_ok({"deleted": True})])

    c.memory_forget(memory_id="memory:xyz")

    call = c._session.calls[0]
    assert call["json"]["method"] == "memory/forget"
    assert call["json"]["params"] == {"memory_id": "memory:xyz"}


# ---------------------------------------------------------------------------
# memory_relate
# ---------------------------------------------------------------------------


def test_memory_relate_sends_from_to_type():
    c = _client([_rpc_ok({"id": "relation:abc"})])

    c.memory_relate(
        from_memory="memory:a",
        to_memory="memory:b",
        relation_type="derives_from",
    )

    call = c._session.calls[0]
    assert call["json"]["method"] == "memory/relate"
    params = call["json"]["params"]
    assert params["from"] == "memory:a"
    assert params["to"] == "memory:b"
    assert params["relation_type"] == "derives_from"


def test_memory_relate_forwards_strength_and_metadata():
    c = _client([_rpc_ok({"id": "relation:abc"})])

    c.memory_relate(
        from_memory="memory:a",
        to_memory="memory:b",
        relation_type="supports",
        strength=0.8,
        metadata={"why": "test"},
    )

    params = c._session.calls[0]["json"]["params"]
    assert params["strength"] == 0.8
    assert params["metadata"] == {"why": "test"}
