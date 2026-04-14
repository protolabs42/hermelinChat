"""Memory RPC helpers on ``ChorusClient`` — store, query, recall."""

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
        if not self._responses:
            raise AssertionError("FakeSession exhausted")
        return self._responses.pop(0)

    def post(self, url, json=None, headers=None, timeout=None):
        return self.request("POST", url, json=json, headers=headers, timeout=timeout)


def _client(responses):
    from plugins.memory.chorus.client import ChorusClient, ChorusClientConfig

    cfg = ChorusClientConfig(
        url="http://localhost:3099",
        api_key="sk-test",
        identity_name="hermes-test",
    )
    return ChorusClient(cfg, session=_FakeSession(responses))


def _rpc_ok(result):
    return _FakeResponse(200, {"jsonrpc": "2.0", "id": 1, "result": result})


def test_memory_store_sends_correct_rpc():
    c = _client([_rpc_ok({"id": "memory:xyz"})])

    out = c.memory_store(
        content="hello world",
        entity="hermes-test-entity",
        category="semantic",
        tags=["tag1", "tag2"],
        memory_type="semantic",
    )

    sess = c._session  # type: ignore[attr-defined]
    call = sess.calls[0]
    assert call["json"]["method"] == "memory/store"
    params = call["json"]["params"]
    assert params["content"] == "hello world"
    assert params["entity"] == "hermes-test-entity"
    assert params["category"] == "semantic"
    assert params["tags"] == ["tag1", "tag2"]
    assert params["memory_type"] == "semantic"
    assert out == {"id": "memory:xyz"}


def test_memory_store_omits_none_params():
    c = _client([_rpc_ok({"id": "memory:abc"})])

    c.memory_store(content="hello")

    sess = c._session  # type: ignore[attr-defined]
    params = sess.calls[0]["json"]["params"]
    assert "content" in params
    assert "tags" not in params
    assert "entity" not in params
    assert "memory_type" not in params


def test_memory_query_sends_correct_rpc():
    c = _client([_rpc_ok({"memories": [{"id": "m1", "content": "x"}]})])

    out = c.memory_query(query="hello", limit=5, tags=["foo"])

    sess = c._session  # type: ignore[attr-defined]
    call = sess.calls[0]
    assert call["json"]["method"] == "memory/query"
    params = call["json"]["params"]
    assert params["query"] == "hello"
    assert params["limit"] == 5
    assert params["tags"] == ["foo"]
    assert out == {"memories": [{"id": "m1", "content": "x"}]}


def test_memory_recall_sends_correct_rpc():
    c = _client([_rpc_ok({"memories": []})])

    c.memory_recall(entity="sophie")

    sess = c._session  # type: ignore[attr-defined]
    call = sess.calls[0]
    assert call["json"]["method"] == "memory/recall"
    assert call["json"]["params"] == {"entity": "sophie"}
