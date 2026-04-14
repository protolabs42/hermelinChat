"""``ChorusClient.signal_emit`` — signal/emit RPC."""

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

    def post(self, url, json=None, headers=None, timeout=None):
        self.calls.append({"url": url, "json": json, "headers": dict(headers or {})})
        return self._responses.pop(0)


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


def test_signal_emit_sends_correct_rpc():
    c = _client([_rpc_ok({"id": "signal:new"})])

    result = c.signal_emit(
        stream_type="pulse",
        content="working on chorus plugin",
        urgency=0.2,
        tags=["chorus", "plugin"],
    )

    sess = c._session  # type: ignore[attr-defined]
    call = sess.calls[0]
    assert call["json"]["method"] == "signal/emit"
    params = call["json"]["params"]
    assert params["stream_type"] == "pulse"
    assert params["content"] == "working on chorus plugin"
    assert params["urgency"] == 0.2
    assert params["tags"] == ["chorus", "plugin"]
    assert result == {"id": "signal:new"}


def test_signal_emit_omits_none_params():
    c = _client([_rpc_ok({"id": "signal:x"})])

    c.signal_emit(stream_type="sense", content="done")

    sess = c._session  # type: ignore[attr-defined]
    params = sess.calls[0]["json"]["params"]
    assert "stream_type" in params
    assert "content" in params
    assert "urgency" not in params  # None stripped
    assert "tags" not in params
