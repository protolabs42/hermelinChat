"""RPC transport tests for ``ChorusClient``.

Exercises the Bearer-authed ``POST /rpc`` wrapper against a mocked HTTP
session. Integration tests against a real tunnel live in
``test_integration.py`` and are gated behind ``CHORUS_INTEGRATION_TESTS=1``.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock

import pytest


# ---------------------------------------------------------------------------
# Mock transport helpers
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, status: int, payload: Any = None, text: str = "") -> None:
        self.status_code = status
        self._payload = payload
        self.text = text or (json.dumps(payload) if payload is not None else "")

    def json(self) -> Any:
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class _FakeSession:
    """Records calls + returns scripted responses."""

    def __init__(self, responses: List[_FakeResponse]) -> None:
        self._responses = list(responses)
        self.calls: List[Dict[str, Any]] = []

    def post(self, url: str, json: Any = None, headers: Optional[Dict[str, str]] = None,
             timeout: Optional[float] = None) -> _FakeResponse:
        self.calls.append({
            "url": url,
            "json": json,
            "headers": dict(headers or {}),
            "timeout": timeout,
        })
        if not self._responses:
            raise AssertionError("FakeSession exhausted — unexpected extra request")
        return self._responses.pop(0)


def _make_config(**overrides):
    from plugins.memory.chorus.client import ChorusClientConfig

    defaults = dict(
        url="http://localhost:3099",
        api_key="sk-test",
        identity_name="hermes-test",
    )
    defaults.update(overrides)
    return ChorusClientConfig(**defaults)


# ---------------------------------------------------------------------------
# Envelope + auth
# ---------------------------------------------------------------------------


def test_rpc_posts_to_rpc_endpoint_with_bearer_header():
    from plugins.memory.chorus.client import ChorusClient

    session = _FakeSession([_FakeResponse(200, {"jsonrpc": "2.0", "id": 1, "result": {"ok": True}})])
    client = ChorusClient(_make_config(), session=session)

    client._rpc("identity/whoami")

    assert len(session.calls) == 1
    call = session.calls[0]
    assert call["url"] == "http://localhost:3099/rpc"
    assert call["headers"]["Authorization"] == "Bearer sk-test"
    assert call["headers"]["Content-Type"] == "application/json"
    assert call["json"]["jsonrpc"] == "2.0"
    assert call["json"]["method"] == "identity/whoami"
    assert call["json"]["params"] == {}
    assert "id" in call["json"]


def test_rpc_returns_result_payload_on_success():
    from plugins.memory.chorus.client import ChorusClient

    session = _FakeSession([_FakeResponse(200, {
        "jsonrpc": "2.0", "id": 1, "result": {"identity": "abc", "name": "sophie"}
    })])
    client = ChorusClient(_make_config(), session=session)

    result = client._rpc("identity/whoami")
    assert result == {"identity": "abc", "name": "sophie"}


def test_rpc_forwards_params_when_provided():
    from plugins.memory.chorus.client import ChorusClient

    session = _FakeSession([_FakeResponse(200, {"jsonrpc": "2.0", "id": 1, "result": []})])
    client = ChorusClient(_make_config(), session=session)

    client._rpc("memory/query", {"query": "hello", "limit": 5})

    params = session.calls[0]["json"]["params"]
    assert params == {"query": "hello", "limit": 5}


# ---------------------------------------------------------------------------
# Error policy
# ---------------------------------------------------------------------------


def test_rpc_raises_auth_error_on_401():
    from plugins.memory.chorus.client import ChorusAuthError, ChorusClient

    session = _FakeSession([_FakeResponse(401, {"error": "unauthorized"})])
    client = ChorusClient(_make_config(), session=session)

    with pytest.raises(ChorusAuthError):
        client._rpc("identity/whoami")


def test_rpc_raises_permission_error_on_403():
    from plugins.memory.chorus.client import ChorusClient, ChorusPermissionError

    session = _FakeSession([_FakeResponse(403, {"error": "role not held"})])
    client = ChorusClient(_make_config(), session=session)

    with pytest.raises(ChorusPermissionError):
        client._rpc("signal/emit", {"stream_type": "pulse", "content": "x"})


def test_rpc_raises_jsonrpc_error_when_body_contains_error():
    from plugins.memory.chorus.client import ChorusClient, ChorusRpcError

    session = _FakeSession([_FakeResponse(200, {
        "jsonrpc": "2.0", "id": 1,
        "error": {"code": -32600, "message": "Invalid request"},
    })])
    client = ChorusClient(_make_config(), session=session)

    with pytest.raises(ChorusRpcError) as excinfo:
        client._rpc("memory/store")
    assert "Invalid request" in str(excinfo.value)


def test_rpc_retries_once_on_5xx_then_succeeds():
    from plugins.memory.chorus.client import ChorusClient

    session = _FakeSession([
        _FakeResponse(503, text="upstream unavailable"),
        _FakeResponse(200, {"jsonrpc": "2.0", "id": 2, "result": {"ok": True}}),
    ])
    client = ChorusClient(_make_config(), session=session, retry_backoff=0)

    result = client._rpc("memory/store", {"content": "x"})

    assert result == {"ok": True}
    assert len(session.calls) == 2


def test_rpc_gives_up_after_retry_on_persistent_5xx():
    from plugins.memory.chorus.client import ChorusClient, ChorusServerError

    session = _FakeSession([
        _FakeResponse(500, text="boom"),
        _FakeResponse(500, text="still boom"),
    ])
    client = ChorusClient(_make_config(), session=session, retry_backoff=0)

    with pytest.raises(ChorusServerError):
        client._rpc("memory/store")
    assert len(session.calls) == 2


def test_rpc_wraps_connection_errors_as_unreachable():
    import requests
    from plugins.memory.chorus.client import ChorusClient, ChorusUnreachableError

    session = MagicMock()
    session.post.side_effect = requests.ConnectionError("refused")
    client = ChorusClient(_make_config(), session=session, retry_backoff=0)

    with pytest.raises(ChorusUnreachableError):
        client._rpc("identity/whoami")


def test_rpc_wraps_timeout_as_unreachable():
    import requests
    from plugins.memory.chorus.client import ChorusClient, ChorusUnreachableError

    session = MagicMock()
    session.post.side_effect = requests.Timeout("slow")
    client = ChorusClient(_make_config(), session=session, retry_backoff=0)

    with pytest.raises(ChorusUnreachableError):
        client._rpc("identity/whoami")


# ---------------------------------------------------------------------------
# High-level helpers
# ---------------------------------------------------------------------------


def test_whoami_returns_identity_dict():
    from plugins.memory.chorus.client import ChorusClient

    session = _FakeSession([_FakeResponse(200, {
        "jsonrpc": "2.0", "id": 1,
        "result": {
            "id": "identity:abc",
            "name": "sophie",
            "type": "agent",
            "capabilities": ["memory:store"],
            "is_admin": False,
        },
    })])
    client = ChorusClient(_make_config(), session=session)

    identity = client.whoami()

    assert identity["id"] == "identity:abc"
    assert identity["name"] == "sophie"


def test_whoami_raises_auth_error_when_token_invalid():
    from plugins.memory.chorus.client import ChorusAuthError, ChorusClient

    session = _FakeSession([_FakeResponse(401)])
    client = ChorusClient(_make_config(), session=session)

    with pytest.raises(ChorusAuthError):
        client.whoami()
