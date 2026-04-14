"""``ChorusClient.signal_emit`` — REST ``POST /emit``.

Signal emission does not go through the JSON-RPC envelope used by memory
operations. The real chorus-protocol SDK posts directly to ``POST /emit``
with the signal body as JSON. Our tests lock that in.
"""

from __future__ import annotations

import json

import pytest


class _FakeResponse:
    def __init__(self, status=200, payload=None, text=""):
        self.status_code = status
        self._payload = payload
        self.text = text or (json.dumps(payload) if payload is not None else "")

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class _FakeSession:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def request(self, method, url, json=None, headers=None, timeout=None):
        self.calls.append({"method": method, "url": url, "json": json, "headers": dict(headers or {})})
        if not self._responses:
            raise AssertionError("FakeSession exhausted — unexpected extra request")
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


def _emit_ok(signal: dict):
    """Shape the real server returns for POST /emit (REST, not RPC)."""
    return _FakeResponse(200, {"data": signal})


# ---------------------------------------------------------------------------
# REST path + body shape
# ---------------------------------------------------------------------------


def test_signal_emit_posts_to_emit_endpoint():
    c = _client([_emit_ok({"id": "signal:new"})])

    c.signal_emit(
        signal_type="pulse",
        content="working on chorus plugin",
        from_role="dev",
    )

    call = c._session.calls[0]
    assert call["url"].endswith("/emit"), f"expected /emit endpoint, got {call['url']}"
    assert not call["url"].endswith("/rpc")
    assert call["headers"]["Authorization"] == "Bearer sk-test"


def test_signal_emit_body_matches_rest_schema():
    c = _client([_emit_ok({"id": "signal:new"})])

    c.signal_emit(
        signal_type="pulse",
        content="hello",
        from_role="dev",
        urgency=0.2,
        tags=["chorus", "plugin"],
        to_ring="hermelinchat",
    )

    body = c._session.calls[0]["json"]
    # Flat body — no jsonrpc envelope.
    assert "jsonrpc" not in body
    assert "method" not in body
    assert "params" not in body
    assert body["signal_type"] == "pulse"
    assert body["content"] == "hello"
    assert body["from_role"] == "dev"
    assert body["urgency"] == 0.2
    assert body["tags"] == ["chorus", "plugin"]
    assert body["to_ring"] == "hermelinchat"


def test_signal_emit_omits_none_fields():
    c = _client([_emit_ok({"id": "signal:x"})])

    c.signal_emit(signal_type="sense", content="done", from_role="dev")

    body = c._session.calls[0]["json"]
    assert "signal_type" in body
    assert "content" in body
    assert "from_role" in body
    assert "urgency" not in body  # None stripped
    assert "tags" not in body
    assert "to_ring" not in body


def test_signal_emit_unwraps_data_envelope():
    """REST responses wrap the signal in a ``data`` field; caller gets the inner dict."""
    c = _client([_emit_ok({"id": "signal:abc", "content": "x"})])

    result = c.signal_emit(signal_type="pulse", content="x", from_role="dev")

    assert result == {"id": "signal:abc", "content": "x"}


def test_signal_emit_401_raises_auth_error():
    from plugins.memory.chorus.client import ChorusAuthError

    c = _client([_FakeResponse(401, {"error": "unauth"})])

    with pytest.raises(ChorusAuthError):
        c.signal_emit(signal_type="pulse", content="x", from_role="dev")


def test_signal_emit_role_not_held_raises_rpc_error():
    """SIGNAL_ROLE_NOT_HELD is a 400 with a structured error body — surface it cleanly."""
    from plugins.memory.chorus.client import ChorusError

    c = _client([_FakeResponse(400, {
        "error": {
            "code": "SIGNAL_ROLE_NOT_HELD",
            "message": "Identity does not hold role 'role:abc'",
        },
    })])

    with pytest.raises(ChorusError) as excinfo:
        c.signal_emit(signal_type="pulse", content="x", from_role="ops")
    assert "ROLE_NOT_HELD" in str(excinfo.value) or "role" in str(excinfo.value).lower()
