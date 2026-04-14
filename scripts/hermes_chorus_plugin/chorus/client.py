"""Chorus client configuration and HTTP transport.

Two concerns live in this module:

* ``ChorusClientConfig`` — user-facing configuration. No network I/O.
  Resolution order: ``$HERMES_HOME/chorus.json`` → ``~/.hermes/chorus.json``
  → environment variables. Per-field: file value → env var → default.
* ``ChorusClient`` — Bearer-authed JSON-RPC transport against
  ``POST /rpc``. One retry on 5xx, timeout-bounded, error-mapped to typed
  exceptions so callers can react without string-matching.

The split keeps ``is_available()`` (pure config check) from ever touching
the network.
"""

from __future__ import annotations

import itertools
import json
import logging
import os
import socket
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


logger = logging.getLogger(__name__)


_DEFAULT_URL = "http://localhost:3099"
_DEFAULT_RECALL_MODE = "hybrid"
_VALID_RECALL_MODES = {"hybrid", "context", "tools"}
_VALID_SYNC_EMIT = {"never", "every-turn", "session-end"}


def _normalize_recall_mode(val: str | None) -> str:
    if isinstance(val, str) and val in _VALID_RECALL_MODES:
        return val
    return _DEFAULT_RECALL_MODE


def _normalize_sync_emit(val: str | None) -> str:
    if isinstance(val, str) and val in _VALID_SYNC_EMIT:
        return val
    return "session-end"


def _default_identity_name() -> str:
    """Fall back to ``hermes-<hostname>`` when the user hasn't set a name."""
    try:
        host = socket.gethostname().split(".")[0] or "local"
    except Exception:
        host = "local"
    return f"hermes-{host}"


def _resolve_hermes_home() -> Path:
    """Prefer the live hermes helper, fall back to env or ``~/.hermes``.

    Keeps the plugin portable: tests that don't have the hermes package
    on ``sys.path`` still get a correct HERMES_HOME from the environment.
    """
    try:
        from hermes_constants import get_hermes_home  # type: ignore

        return Path(get_hermes_home())
    except Exception:
        env = os.environ.get("HERMES_HOME", "").strip()
        if env:
            return Path(env)
        return Path.home() / ".hermes"


def resolve_config_path() -> Path:
    """Return the first existing chorus.json, or the profile-local path.

    Write destination (when nothing exists yet) is ``$HERMES_HOME/chorus.json``.
    """
    local = _resolve_hermes_home() / "chorus.json"
    if local.exists():
        return local

    default = Path.home() / ".hermes" / "chorus.json"
    if default != local and default.exists():
        return default

    return local


@dataclass
class ChorusClientConfig:
    """User-facing configuration for the Chorus memory provider."""

    url: str = _DEFAULT_URL
    api_key: str | None = None
    identity_name: str = field(default_factory=_default_identity_name)
    recall_mode: str = _DEFAULT_RECALL_MODE
    scope_by_cwd: bool = True
    default_ring: str | None = None
    emit_signals: bool = False
    role_name: str = "dev"
    sync_turn_emit: str = "session-end"
    context_tokens: int = 1500
    memory_query_limit: int = 8
    inbox_limit: int = 5
    timeout_seconds: float = 10.0
    # Raw file contents for anything else consumers may need later.
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def enabled(self) -> bool:
        """Truthy when the provider has enough config to attempt auth.

        Does not hit the network. Used by ``is_available()``.
        """
        return bool(self.url and self.api_key)

    # ------------------------------------------------------------------ I/O

    @classmethod
    def from_global_config(cls, config_path: Path | None = None) -> "ChorusClientConfig":
        """Build a config from file + env vars, with file taking precedence.

        A missing or malformed config file is not fatal — we log at DEBUG and
        fall back to env vars. The agent must never crash because Chorus is
        misconfigured.
        """
        raw: dict[str, Any] = {}
        path = config_path or resolve_config_path()
        if path.exists():
            try:
                raw = json.loads(path.read_text(encoding="utf-8")) or {}
                if not isinstance(raw, dict):
                    logger.debug("Chorus config %s is not a JSON object, ignoring", path)
                    raw = {}
            except (json.JSONDecodeError, OSError) as exc:
                logger.debug("Chorus config %s unreadable (%s), falling back to env", path, exc)
                raw = {}

        env = os.environ

        url = raw.get("url") or env.get("CHORUS_URL") or _DEFAULT_URL
        api_key = raw.get("api_key") or env.get("CHORUS_API_KEY") or None
        identity_name = (
            raw.get("identity_name")
            or env.get("CHORUS_IDENTITY_NAME")
            or _default_identity_name()
        )
        recall_mode = _normalize_recall_mode(
            raw.get("recall_mode") or env.get("CHORUS_RECALL_MODE")
        )

        return cls(
            url=url,
            api_key=api_key,
            identity_name=identity_name,
            recall_mode=recall_mode,
            scope_by_cwd=bool(raw.get("scope_by_cwd", True)),
            default_ring=raw.get("default_ring") or None,
            emit_signals=bool(raw.get("emit_signals", False)),
            role_name=str(raw.get("role_name") or "dev"),
            sync_turn_emit=_normalize_sync_emit(raw.get("sync_turn_emit")),
            context_tokens=int(raw.get("context_tokens") or 1500),
            memory_query_limit=int(raw.get("memory_query_limit") or 8),
            inbox_limit=int(raw.get("inbox_limit") or 5),
            timeout_seconds=float(raw.get("timeout_seconds") or 10.0),
            raw=raw,
        )


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class ChorusError(Exception):
    """Base class for every Chorus transport / RPC failure.

    Callers can catch this broadly to mark the provider inactive without
    caring about the specific subtype. Subtypes exist so the provider can
    differentiate soft failures (unreachable, transient 5xx) from hard
    failures (bad token, missing role) that shouldn't be retried.
    """


class ChorusAuthError(ChorusError):
    """HTTP 401. The api_key is missing, malformed, or revoked."""


class ChorusPermissionError(ChorusError):
    """HTTP 403. The identity lacks a role fill required for the method."""


class ChorusRpcError(ChorusError):
    """The server returned HTTP 200 with a JSON-RPC ``error`` envelope."""


class ChorusServerError(ChorusError):
    """HTTP 5xx after one retry — Chorus is unhealthy."""


class ChorusUnreachableError(ChorusError):
    """Connection refused, DNS failure, or request timeout.

    Usually means the Tailscale tunnel / chorus-tunnel.service is down.
    """


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------


_DEFAULT_RETRY_BACKOFF = 1.0


class ChorusClient:
    """Thin Bearer-authed JSON-RPC client for a Chorus hive.

    One instance per hermes session. Thread-safe for the patterns used by
    the provider (one request per thread at a time; ``requests.Session``
    handles concurrent calls from separate threads).
    """

    _id_counter = itertools.count(1)

    def __init__(
        self,
        config: "ChorusClientConfig",
        session: Any = None,
        retry_backoff: float = _DEFAULT_RETRY_BACKOFF,
    ) -> None:
        self._config = config
        self._session = session if session is not None else self._build_session()
        self._retry_backoff = retry_backoff

    # -- low level ------------------------------------------------------------

    def _build_session(self):
        """Build the default ``requests.Session``.

        Isolated for tests; they pass a fake. Import is lazy so the plugin
        itself doesn't hard-require ``requests`` at import time (the
        transport only runs after ``is_available()`` / ``initialize()``).
        """
        try:
            import requests
        except ImportError as exc:  # pragma: no cover
            raise ChorusError(
                "The 'requests' package is required for Chorus transport; "
                "install it with `pip install requests`."
            ) from exc
        return requests.Session()

    def _rpc(self, method: str, params: dict | None = None) -> Any:
        """Dispatch a single JSON-RPC call.

        Returns the ``result`` field on success. Raises a typed
        ``ChorusError`` subclass on every failure mode. Retries ONCE on
        transient 5xx with a small backoff; everything else fails fast.
        """
        # Requests can raise either of these; isolate import for clarity.
        import requests

        url = self._config.url.rstrip("/") + "/rpc"
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": next(self._id_counter),
        }
        headers = {
            "Authorization": f"Bearer {self._config.api_key or ''}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        for attempt in range(2):  # at most one retry
            try:
                response = self._session.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=self._config.timeout_seconds,
                )
            except (requests.ConnectionError, requests.Timeout) as exc:
                raise ChorusUnreachableError(
                    f"Chorus at {self._config.url} is unreachable: {exc}"
                ) from exc
            except requests.RequestException as exc:
                raise ChorusError(f"Chorus request failed: {exc}") from exc

            status = response.status_code
            if status == 401:
                raise ChorusAuthError(
                    f"Chorus rejected the api_key (401) on {method}: {_response_excerpt(response)}"
                )
            if status == 403:
                raise ChorusPermissionError(
                    f"Chorus denied {method} (403): {_response_excerpt(response)}"
                )
            if 500 <= status < 600:
                if attempt == 0:
                    if self._retry_backoff:
                        time.sleep(self._retry_backoff)
                    continue
                raise ChorusServerError(
                    f"Chorus server error ({status}) on {method}: {_response_excerpt(response)}"
                )
            if status >= 400:
                raise ChorusError(
                    f"Chorus HTTP {status} on {method}: {_response_excerpt(response)}"
                )

            try:
                body = response.json()
            except (ValueError, json.JSONDecodeError) as exc:
                raise ChorusError(
                    f"Chorus returned non-JSON body on {method}: {_response_excerpt(response)}"
                ) from exc

            if isinstance(body, dict) and body.get("error"):
                err = body["error"]
                code = err.get("code")
                message = err.get("message", "unknown")
                raise ChorusRpcError(
                    f"Chorus RPC error ({code}) on {method}: {message}"
                )

            if isinstance(body, dict) and "result" in body:
                return body["result"]
            # Some endpoints might not wrap in JSON-RPC; return raw body.
            return body

        # Unreachable — the loop either returns or raises.
        raise ChorusError(f"Chorus {method}: exhausted retries without response")

    # -- high level -----------------------------------------------------------

    def whoami(self) -> dict:
        """Verify auth and fetch identity metadata."""
        result = self._rpc("identity/whoami")
        if not isinstance(result, dict):
            raise ChorusError(f"Unexpected whoami result: {result!r}")
        return result

    def memory_store(
        self,
        content: str,
        *,
        entity: str | None = None,
        category: str | None = None,
        tags: list | None = None,
        memory_type: str | None = None,
        namespace: str | None = None,
        confidence: float | None = None,
    ) -> Any:
        """Persist a memory via ``memory/store``.

        ``None`` params are omitted from the envelope so we never send
        explicit nulls the server would have to special-case.
        """
        params = _compact({
            "content": content,
            "entity": entity,
            "category": category,
            "tags": tags,
            "memory_type": memory_type,
            "namespace": namespace,
            "confidence": confidence,
        })
        return self._rpc("memory/store", params)

    def memory_query(
        self,
        *,
        query: str,
        limit: int | None = None,
        tags: list | None = None,
        namespace: str | None = None,
    ) -> Any:
        """Semantic search via ``memory/query``."""
        params = _compact({
            "query": query,
            "limit": limit,
            "tags": tags,
            "namespace": namespace,
        })
        return self._rpc("memory/query", params)

    def memory_recall(self, *, entity: str) -> Any:
        """Recall every memory for a named entity via ``memory/recall``."""
        return self._rpc("memory/recall", {"entity": entity})

    def signal_emit(
        self,
        *,
        stream_type: str,
        content: str,
        urgency: float | None = None,
        tags: list | None = None,
        namespace: str | None = None,
    ) -> Any:
        """Emit a signal via ``signal/emit``.

        Gated by the caller — the plugin only calls this when
        ``emit_signals`` is truthy and the identity holds a signal-capable
        role. Permission errors must be caught at the callsite so we can
        degrade gracefully.
        """
        params = _compact({
            "stream_type": stream_type,
            "content": content,
            "urgency": urgency,
            "tags": tags,
            "namespace": namespace,
        })
        return self._rpc("signal/emit", params)


def _compact(params: dict) -> dict:
    """Drop keys whose value is ``None``. Keeps the wire protocol tidy."""
    return {k: v for k, v in params.items() if v is not None}


def _response_excerpt(response) -> str:
    """Truncate response text for log messages; never raise from logging."""
    try:
        text = (response.text or "").strip()
    except Exception:
        return "<unreadable>"
    return text[:200] if text else "<empty>"
