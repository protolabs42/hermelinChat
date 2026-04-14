"""Chorus memory provider plugin — MemoryProvider for the Chorus hive.

Exposes a hermes-agent plugin that lets the running agent join a Chorus ring,
inject resume context into its system prompt, recall knowledge before each
turn, persist new knowledge through the session, and — opt-in — emit signals
for audit trail.

Architecture and contract details live in
``hermelinChat/.planning/chorus-hermes-plugin.md``.

Transport (RPC envelope, Bearer auth, retry, error mapping) lives in
``client.py``. Session orchestration (threads, prefetch, batching) lives in
``session.py`` — added in later phases. This file keeps the MemoryProvider
surface area clean and dispatch-only.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from agent.memory_provider import MemoryProvider

from plugins.memory.chorus.client import (
    ChorusAuthError,
    ChorusClient,
    ChorusClientConfig,
    ChorusError,
    ChorusPermissionError,
    ChorusUnreachableError,
)

try:
    # Official hermes helper — formats tool errors consistently.
    from tools.registry import tool_error  # type: ignore
except Exception:  # pragma: no cover — only hit when tests run outside hermes
    def tool_error(message: str, **extra: Any) -> str:
        payload = {"error": message}
        payload.update(extra)
        return json.dumps(payload)


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tool schemas (exposed to the model when active, filtered by recall_mode)
# ---------------------------------------------------------------------------


STORE_SCHEMA: Dict[str, Any] = {
    "name": "chorus_memory_store",
    "description": (
        "Persist a memory into the Chorus hive, scoped to this project's ring. "
        "Use to save durable facts, decisions, preferences, or breadcrumbs you "
        "want available across future sessions. Prefer small, atomic entries."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "content": {
                "type": "string",
                "description": "The memory text. Keep it self-contained — future readers won't have this turn's context.",
            },
            "entity": {
                "type": "string",
                "description": "Named subject of the memory (person, project, concept). Enables later recall.",
            },
            "category": {
                "type": "string",
                "description": "Free-form category label (e.g. 'planning', 'configuration', 'decision').",
            },
            "tags": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Tags for filtering at query time.",
            },
            "memory_type": {
                "type": "string",
                "enum": ["semantic", "episodic", "procedural"],
                "description": "semantic = facts, episodic = events, procedural = how-to.",
            },
        },
        "required": ["content"],
    },
}


QUERY_SCHEMA: Dict[str, Any] = {
    "name": "chorus_memory_query",
    "description": (
        "Semantic search over Chorus memories accessible to this identity. "
        "Returns relevant entries with content, tags, and age. "
        "Use before making non-trivial decisions — prior context may exist."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language description of what you're looking for.",
            },
            "limit": {
                "type": "integer",
                "description": "Maximum results to return. Default 8, max 25.",
            },
            "tags": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Restrict results to memories tagged with ALL of these.",
            },
        },
        "required": ["query"],
    },
}


RECALL_SCHEMA: Dict[str, Any] = {
    "name": "chorus_memory_recall",
    "description": (
        "Return every memory about a named entity across accessible namespaces. "
        "Fast, no semantic scoring — use when you have a concrete name to look up."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "entity": {
                "type": "string",
                "description": "The entity name to recall memories for.",
            },
        },
        "required": ["entity"],
    },
}


MEMORY_TOOL_SCHEMAS: List[Dict[str, Any]] = [STORE_SCHEMA, QUERY_SCHEMA, RECALL_SCHEMA]


# ---------------------------------------------------------------------------
# MemoryProvider implementation
# ---------------------------------------------------------------------------


class ChorusMemoryProvider(MemoryProvider):
    """Chorus memory provider.

    Always-safe by construction: the ABC surface (``is_available``,
    ``initialize``, every optional hook) short-circuits cleanly when the
    plugin is unconfigured, unreachable, rejected, or running under a
    cron/subagent context. The agent loop must never crash because of us.
    """

    def __init__(self) -> None:
        # Lazily loaded on first access via ``_load_config`` so construction
        # is cheap and network-free (``is_available`` is called from
        # ``discover_memory_providers`` on every hermes boot).
        self._config: Optional[ChorusClientConfig] = None
        self._client: Optional[ChorusClient] = None
        self._identity: Optional[Dict[str, Any]] = None

        # Guards — once tripped, every public hook returns its safe default.
        self._cron_skipped = False
        self._inactive_reason: Optional[str] = None

        # Threading primitives for background prefetch / sync (phase 4/5).
        self._prefetch_lock = threading.Lock()
        self._prefetch_result: str = ""
        self._prefetch_thread: Optional[threading.Thread] = None
        self._sync_thread: Optional[threading.Thread] = None

        # First-call system-prompt bake — computed once, returned verbatim
        # afterwards so the prompt cache remains stable across turns.
        self._first_turn_block: Optional[str] = None
        self._first_turn_lock = threading.Lock()

        # Bookkeeping for lifecycle hooks.
        self._turn_count = 0
        self._session_id: str = ""
        self._ring: Optional[str] = None

        # Lifecycle accumulators.
        self._pending_turns: List[Dict[str, str]] = []
        self._pending_turns_lock = threading.Lock()

    # ---- required ABC surface ------------------------------------------------

    @property
    def name(self) -> str:
        return "chorus"

    def is_available(self) -> bool:
        """Pure config check — no network.

        Returns True only when we have enough information to attempt auth.
        """
        try:
            return bool(self._load_config().enabled)
        except Exception as exc:
            logger.debug("Chorus is_available check failed: %s", exc)
            return False

    def initialize(self, session_id: str, **kwargs) -> None:
        """Per-session setup.

        Runs, in order:

        1. **Cron guard** — cron / flush / subagent contexts never touch the hive.
        2. **Config load** — deferred until now so ``is_available()`` stays pure.
        3. **whoami probe** — proves (url, api_key) are valid before any real
           work. Any failure flips ``_inactive_reason`` and the provider
           behaves like a no-op for the rest of the session. No exception
           ever escapes — the agent must keep running.
        4. **Ring resolution** — derives the project ring from ``cwd``, falling
           back to ``default_ring`` when the cwd can't be mapped.
        """
        self._session_id = session_id

        agent_context = kwargs.get("agent_context", "")
        platform = kwargs.get("platform", "cli")
        if agent_context in ("cron", "flush") or platform == "cron":
            self._cron_skipped = True
            logger.debug(
                "Chorus skipped: cron/flush context (agent_context=%s, platform=%s)",
                agent_context, platform,
            )
            return

        try:
            config = self._load_config()
        except Exception as exc:
            self._inactive_reason = f"config-error: {exc}"
            logger.warning("Chorus config load failed, plugin inactive: %s", exc)
            return

        if not config.enabled:
            self._inactive_reason = "unconfigured"
            logger.debug("Chorus has no api_key — plugin inactive this session")
            return

        try:
            self._client = ChorusClient(config)
            self._identity = self._client.whoami()
        except ChorusAuthError as exc:
            self._inactive_reason = f"auth-failed: {exc}"
            logger.warning(
                "Chorus auth failed (%s); plugin inactive this session. "
                "Check CHORUS_API_KEY or re-run `hermes memory setup`.",
                exc,
            )
            return
        except ChorusUnreachableError as exc:
            self._inactive_reason = f"unreachable: {exc}"
            logger.warning(
                "Chorus unreachable at %s (%s); plugin inactive this session. "
                "Check chorus-tunnel.service / Tailscale mesh.",
                config.url, exc,
            )
            return
        except ChorusPermissionError as exc:
            self._inactive_reason = f"permission-denied: {exc}"
            logger.warning("Chorus whoami denied (%s); plugin inactive.", exc)
            return
        except ChorusError as exc:
            self._inactive_reason = f"error: {exc}"
            logger.warning("Chorus whoami failed (%s); plugin inactive.", exc)
            return
        except Exception as exc:
            # Belt-and-braces: never let a provider crash the agent loop.
            self._inactive_reason = f"unexpected-error: {exc}"
            logger.warning("Chorus initialize crashed unexpectedly: %s", exc)
            return

        self._ring = _resolve_ring(kwargs.get("cwd"), config)
        logger.debug(
            "Chorus initialized: identity=%s ring=%s",
            (self._identity or {}).get("name"),
            self._ring,
        )

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        """Return the tools we expose to the model.

        ``recall_mode`` gates exposure:
          * ``"context"`` — zero tools; only system-prompt injection.
          * ``"tools"``   — all memory tools, no auto-injection.
          * ``"hybrid"``  — all memory tools *and* auto-injection.
        """
        if not self._active():
            return []
        config = self._config or self._load_config()
        if config.recall_mode == "context":
            return []
        return list(MEMORY_TOOL_SCHEMAS)

    # ---- optional hooks (safe defaults) --------------------------------------

    def system_prompt_block(self) -> str:
        """Inject a resume block into the hermes system prompt.

        Behavior:

        * Empty when the plugin is inactive or ``recall_mode == "tools"``.
        * First call fetches the most-recent ring memories via ``memory/query``
          (bounded by ``memory_query_limit`` and ``context_tokens``), formats
          them as markdown, and caches the result under ``_first_turn_lock``.
        * Subsequent calls return the cached block unchanged so the prompt
          cache stays warm.
        * Fetch errors are swallowed — the cache stores an empty block so
          we don't hammer the server on every turn.
        """
        if not self._active():
            return ""

        config = self._config or self._load_config()
        if config.recall_mode == "tools":
            return ""

        with self._first_turn_lock:
            if self._first_turn_block is None:
                self._first_turn_block = self._build_first_turn_block(config)

        return self._first_turn_block

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        """Return a background-fetched context block for the upcoming turn.

        Non-blocking: returns whatever ``queue_prefetch`` produced since the
        last call (or empty). Applies the ``context_tokens`` char budget to
        keep the injection tidy.
        """
        if not self._active():
            return ""

        config = self._config or self._load_config()
        if config.recall_mode == "tools":
            # Drain anything a stale queue produced so we don't inject later.
            with self._prefetch_lock:
                self._prefetch_result = ""
            return ""

        with self._prefetch_lock:
            result = self._prefetch_result
            self._prefetch_result = ""

        if not result:
            return ""

        return self._truncate_to_budget(result, config.context_tokens)

    def queue_prefetch(self, query: str, *, session_id: str = "") -> None:
        """Spawn a daemon thread that fetches ring-scoped memories.

        No-op when inactive, cron-skipped, in ``tools`` recall mode, or
        when the query is empty. All failures are logged at DEBUG and
        never surface to the caller.
        """
        if not self._active() or not query.strip():
            return

        config = self._config or self._load_config()
        if config.recall_mode == "tools":
            return

        client = self._client
        if client is None:
            return

        # Wait for any prior prefetch to finish so we don't stack threads
        # that stomp each other's result slot.
        if self._prefetch_thread is not None and self._prefetch_thread.is_alive():
            self._prefetch_thread.join(timeout=3.0)

        limit = config.memory_query_limit
        namespace = self._resolve_namespace()

        def _run() -> None:
            try:
                response = client.memory_query(
                    query=query, limit=limit, namespace=namespace,
                )
            except ChorusError as exc:
                logger.debug("Chorus prefetch memory_query failed: %s", exc)
                return
            except Exception as exc:  # pragma: no cover — belt and braces
                logger.debug("Chorus prefetch crashed: %s", exc)
                return

            memories = _extract_memories(response)
            if not memories:
                return
            formatted = _format_memories_for_prefetch(memories)
            with self._prefetch_lock:
                self._prefetch_result = formatted

        self._prefetch_thread = threading.Thread(
            target=_run, name="chorus-prefetch", daemon=True,
        )
        self._prefetch_thread.start()

    def sync_turn(
        self,
        user_content: str,
        assistant_content: str,
        *,
        session_id: str = "",
    ) -> None:
        """Persist the turn to the hive.

        Behavior depends on config:

        * ``sync_turn_emit == "never"`` — no-op; memory-only mode.
        * ``sync_turn_emit == "every-turn"`` + ``emit_signals`` — fire a
          ``pulse`` signal in a daemon thread with the user message preview.
        * ``sync_turn_emit == "session-end"`` (default) — accumulate the
          turn for a single summary emission in ``on_session_end``.

        Permission errors on the wire disable future emissions for this
        session (role not filled) but don't disable memory-only features.
        """
        if not self._active():
            return

        config = self._config or self._load_config()
        mode = config.sync_turn_emit

        if mode == "never":
            return

        with self._pending_turns_lock:
            self._pending_turns.append({
                "user": user_content,
                "assistant": assistant_content,
            })

        if mode == "every-turn" and config.emit_signals and self._client is not None:
            self._spawn_signal_emit(
                stream_type="pulse",
                content=_preview(user_content, limit=180),
                urgency=0.1,
                tags=["hermes-plugin", "turn"],
            )

    def on_turn_start(self, turn_number: int, message: str, **kwargs) -> None:
        self._turn_count = turn_number

    def on_session_end(self, messages: List[Dict[str, Any]]) -> None:
        """Flush pending work on session exit.

        Order:
          1. Join any background sync/prefetch threads (time-bounded).
          2. If anything happened this session, store a resumption-briefing
             memory so future sessions can pick up context.
          3. If ``emit_signals`` is on, emit a single ``sense`` signal
             summarising the session.

        All errors are logged at WARNING and swallowed — the hermes shutdown
        path must not depend on Chorus being healthy.
        """
        if not self._active() or self._client is None:
            return

        # Drain background threads first so we don't race with them.
        for thread in (self._prefetch_thread, self._sync_thread):
            if thread is not None and thread.is_alive():
                thread.join(timeout=5.0)

        with self._pending_turns_lock:
            turn_count = len(self._pending_turns)
            first_user = self._pending_turns[0]["user"] if self._pending_turns else ""

        if turn_count == 0:
            return

        briefing = _build_session_briefing(
            session_id=self._session_id,
            turn_count=turn_count,
            first_user=first_user,
            messages=messages,
        )

        try:
            self._client.memory_store(
                content=briefing,
                entity=self._ring or "hermes-session",
                category="session-briefing",
                tags=["hermes-plugin", "session-end", self._ring or "unknown-ring"],
                memory_type="episodic",
                namespace=self._resolve_namespace(),
            )
        except ChorusError as exc:
            logger.warning("Chorus on_session_end briefing store failed: %s", exc)
        except Exception as exc:  # pragma: no cover
            logger.warning("Chorus on_session_end briefing crashed: %s", exc)

        config = self._config or self._load_config()
        if config.emit_signals:
            try:
                self._client.signal_emit(
                    stream_type="sense",
                    content=f"hermes session ended after {turn_count} turns",
                    urgency=0.1,
                    tags=["hermes-plugin", "session-end"],
                )
            except ChorusPermissionError as exc:
                logger.warning(
                    "Chorus signal/emit denied on session end (%s); role not filled.",
                    exc,
                )
            except ChorusError as exc:
                logger.warning("Chorus session-end signal failed: %s", exc)
            except Exception as exc:  # pragma: no cover
                logger.warning("Chorus session-end signal crashed: %s", exc)

    def on_pre_compress(self, messages: List[Dict[str, Any]]) -> str:
        """Preserve insight across context compression.

        Returns a short text handed to the compressor prompt. Also stores
        the same summary as an episodic memory so it's recoverable later
        even if the compressor overwrites it.
        """
        if not self._active() or self._client is None:
            return ""

        summary = _summarise_messages(messages)
        if not summary:
            return ""

        namespace = self._resolve_namespace()

        def _store() -> None:
            try:
                self._client.memory_store(
                    content=summary,
                    entity=self._ring or "hermes-session",
                    category="pre-compress-insight",
                    tags=["hermes-plugin", "pre-compress"],
                    memory_type="episodic",
                    namespace=namespace,
                )
            except ChorusError as exc:
                logger.debug("Chorus on_pre_compress store failed: %s", exc)
            except Exception as exc:  # pragma: no cover
                logger.debug("Chorus on_pre_compress crashed: %s", exc)

        thread = threading.Thread(
            target=_store, name="chorus-precompress", daemon=True,
        )
        thread.start()
        self._sync_thread = thread
        return summary

    def on_memory_write(self, action: str, target: str, content: str) -> None:
        """Mirror built-in MEMORY.md adds into Chorus as tagged memories.

        Only ``add`` actions are mirrored — removes / replaces stay local.
        Target (``user`` vs ``memory``) is carried as a tag so it can be
        recovered later.
        """
        if not self._active() or self._client is None:
            return
        if action != "add":
            return
        text = (content or "").strip()
        if not text:
            return

        category = "user-profile" if target == "user" else "memory"
        tags = ["hermes-plugin", "hermes-mirror", f"target:{target}"]
        namespace = self._resolve_namespace()

        def _mirror() -> None:
            try:
                self._client.memory_store(
                    content=text,
                    entity=self._ring or "hermes-session",
                    category=category,
                    tags=tags,
                    memory_type="semantic",
                    namespace=namespace,
                )
            except ChorusError as exc:
                logger.debug("Chorus on_memory_write mirror failed: %s", exc)
            except Exception as exc:  # pragma: no cover
                logger.debug("Chorus on_memory_write crashed: %s", exc)

        thread = threading.Thread(target=_mirror, name="chorus-mirror", daemon=True)
        thread.start()
        self._sync_thread = thread

    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs) -> str:
        """Dispatch a memory tool call.

        Every branch returns a JSON string (``tool_error(...)`` on failure,
        ``json.dumps({"result": ...})`` on success). We never raise —
        hermes treats raised exceptions as agent errors, which would be
        worse UX than a typed tool_error the model can reason about.
        """
        if self._cron_skipped:
            return tool_error("Chorus is not active in cron context.")
        if self._inactive_reason:
            return tool_error(f"Chorus inactive: {self._inactive_reason}")
        if self._client is None:
            return tool_error("Chorus client not initialized.")

        try:
            if tool_name == "chorus_memory_store":
                content = (args.get("content") or "").strip()
                if not content:
                    return tool_error("Missing required parameter: content")
                result = self._client.memory_store(
                    content=content,
                    entity=args.get("entity") or self._ring or "hermes-session",
                    category=args.get("category") or "note",
                    tags=args.get("tags") or ["hermes-plugin"],
                    memory_type=args.get("memory_type") or "semantic",
                    namespace=self._resolve_namespace(),
                )
                return json.dumps({"result": result})

            if tool_name == "chorus_memory_query":
                query = (args.get("query") or "").strip()
                if not query:
                    return tool_error("Missing required parameter: query")
                limit = args.get("limit")
                if limit is not None:
                    try:
                        limit = max(1, min(int(limit), 25))
                    except (TypeError, ValueError):
                        limit = None
                result = self._client.memory_query(
                    query=query,
                    limit=limit,
                    tags=args.get("tags"),
                    namespace=self._resolve_namespace(),
                )
                return json.dumps({"result": result})

            if tool_name == "chorus_memory_recall":
                entity = (args.get("entity") or "").strip()
                if not entity:
                    return tool_error("Missing required parameter: entity")
                result = self._client.memory_recall(entity=entity)
                return json.dumps({"result": result})

            return tool_error(f"Unknown tool: {tool_name}")

        except ChorusError as exc:
            logger.warning("Chorus %s failed: %s", tool_name, exc)
            return tool_error(f"Chorus {tool_name} failed: {exc}")
        except Exception as exc:  # pragma: no cover — belt and braces
            logger.warning("Chorus %s crashed: %s", tool_name, exc)
            return tool_error(f"Chorus {tool_name} crashed: {exc}")

    def shutdown(self) -> None:
        for thread in (self._prefetch_thread, self._sync_thread):
            if thread is not None and thread.is_alive():
                thread.join(timeout=5.0)

    # ---- setup-wizard surface ------------------------------------------------

    def get_config_schema(self) -> List[Dict[str, Any]]:
        """Fields shown by ``hermes memory setup``.

        Minimal for v1 — URL + API key + identity name cover the happy path.
        Advanced knobs (recall_mode, emit_signals, …) are editable directly
        in ``chorus.json``.
        """
        return [
            {
                "key": "url",
                "description": "Chorus base URL (e.g. http://localhost:3099 over the tunnel)",
                "default": "http://localhost:3099",
            },
            {
                "key": "api_key",
                "description": "Chorus API key (Bearer token). Issued via POST /invite or by ops.",
                "secret": True,
                "required": True,
                "env_var": "CHORUS_API_KEY",
            },
            {
                "key": "identity_name",
                "description": "Identity name to associate with this hermes install.",
            },
            {
                "key": "recall_mode",
                "description": "How memory is exposed to the model.",
                "choices": ["hybrid", "context", "tools"],
                "default": "hybrid",
            },
        ]

    def save_config(self, values: Dict[str, Any], hermes_home: str) -> None:
        """Write non-secret config to ``$HERMES_HOME/chorus.json`` (merge)."""
        config_path = Path(hermes_home) / "chorus.json"
        existing: Dict[str, Any] = {}
        if config_path.exists():
            try:
                existing = json.loads(config_path.read_text(encoding="utf-8")) or {}
                if not isinstance(existing, dict):
                    existing = {}
            except (json.JSONDecodeError, OSError):
                existing = {}
        existing.update(values)
        config_path.write_text(json.dumps(existing, indent=2), encoding="utf-8")

    # ---- internals -----------------------------------------------------------

    def _load_config(self) -> ChorusClientConfig:
        if self._config is None:
            self._config = ChorusClientConfig.from_global_config()
        return self._config

    def _active(self) -> bool:
        """True when the provider should do real work for this session."""
        return not (self._cron_skipped or self._inactive_reason)

    def _resolve_namespace(self) -> str:
        """Namespace string to send with memory/store + memory/query.

        Preference order:
          1. ``ring:<ring-tag>`` when we resolved a ring from cwd. The
             server accepts ring tags (e.g. ``ring:hermelinchat``) and
             resolves them to the internal ring id.
          2. ``agent:<identity.id>`` — the identity's private namespace.
             Always accessible to the caller. Falls back further to just
             ``agent:unknown`` if whoami never returned an id (shouldn't
             happen in the ``_active()`` path, but belt-and-braces).
        """
        if self._ring:
            return f"ring:{self._ring}"
        identity_id = (self._identity or {}).get("id")
        if identity_id:
            return f"agent:{identity_id}"
        return "agent:unknown"

    def _spawn_signal_emit(
        self,
        *,
        stream_type: str,
        content: str,
        urgency: float,
        tags: List[str],
    ) -> None:
        """Fire-and-forget signal emission on a daemon thread.

        Permission errors flip ``emit_signals`` off so we stop hammering
        the server (typical cause: ``hermes-plugin`` role not filled for
        this identity).
        """
        client = self._client
        if client is None:
            return
        config = self._config or self._load_config()

        def _run() -> None:
            try:
                client.signal_emit(
                    stream_type=stream_type,
                    content=content,
                    urgency=urgency,
                    tags=tags,
                )
            except ChorusPermissionError as exc:
                logger.warning(
                    "Chorus signal/emit denied (%s); disabling signal emission "
                    "for this session. Check that the identity holds the "
                    "hermes-plugin role.",
                    exc,
                )
                config.emit_signals = False
            except ChorusError as exc:
                logger.debug("Chorus signal emit failed: %s", exc)
            except Exception as exc:  # pragma: no cover
                logger.debug("Chorus signal emit crashed: %s", exc)

        thread = threading.Thread(target=_run, name="chorus-signal", daemon=True)
        thread.start()
        self._sync_thread = thread

    def _build_first_turn_block(self, config: ChorusClientConfig) -> str:
        """Fetch recent ring memories and format them into a system-prompt block.

        Called exactly once per session (guarded by ``_first_turn_lock``).
        Any failure returns an empty string so we cache a stable result.
        """
        if self._client is None:
            return ""

        identity_name = (self._identity or {}).get("name", config.identity_name)
        query = (
            f"recent context and decisions for {self._ring}"
            if self._ring else "recent context and decisions"
        )

        try:
            response = self._client.memory_query(
                query=query,
                limit=config.memory_query_limit,
                namespace=self._resolve_namespace(),
            )
        except ChorusError as exc:
            logger.warning("Chorus system_prompt_block fetch failed: %s", exc)
            return ""
        except Exception as exc:  # pragma: no cover — belt and braces
            logger.warning("Chorus system_prompt_block crashed: %s", exc)
            return ""

        memories = _extract_memories(response)
        header_bits = [
            "# Chorus Memory",
            f"Active as `{identity_name}`"
            + (f" on ring `{self._ring}`." if self._ring else "."),
        ]
        if config.recall_mode == "hybrid":
            header_bits.append(
                "Memory tools (`chorus_memory_store`, `chorus_memory_query`, "
                "`chorus_memory_recall`) are available — use them to persist or "
                "retrieve ring knowledge as you work."
            )
        header = "\n".join(header_bits)

        if not memories:
            return header

        body = _format_memories_for_prompt(memories)
        block = f"{header}\n\n## Recent ring memory\n{body}"
        return self._truncate_to_budget(block, config.context_tokens)

    @staticmethod
    def _truncate_to_budget(text: str, context_tokens: int) -> str:
        """Soft-truncate ``text`` to roughly ``context_tokens`` worth of chars.

        Uses the conservative 4-chars-per-token estimate hermes uses
        elsewhere. Cuts at a word boundary when possible.
        """
        if not context_tokens or context_tokens <= 0:
            return text
        budget = context_tokens * 4
        if len(text) <= budget:
            return text
        head = text[:budget]
        last_space = head.rfind(" ")
        if last_space > budget * 0.8:
            head = head[:last_space]
        return head.rstrip() + " …"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _preview(text: str, *, limit: int) -> str:
    """Trim ``text`` to ``limit`` chars for signal previews."""
    text = (text or "").strip().replace("\n", " ")
    if len(text) <= limit:
        return text
    head = text[:limit]
    last_space = head.rfind(" ")
    if last_space > limit * 0.7:
        head = head[:last_space]
    return head.rstrip() + "…"


def _summarise_messages(messages: List[Dict[str, Any]]) -> str:
    """Compact summary of a message list for compression / briefings.

    We intentionally keep this deterministic and model-free — the plugin
    never calls out to an LLM for summaries. The hermes compressor can
    rewrite it downstream if it wants nicer prose.
    """
    if not messages:
        return ""
    user_turns = [m.get("content", "") for m in messages if m.get("role") == "user"]
    asst_turns = [m.get("content", "") for m in messages if m.get("role") == "assistant"]
    parts = []
    if user_turns:
        parts.append("User asked: " + _preview(user_turns[0], limit=140))
    if len(user_turns) > 1:
        parts.append(f"+ {len(user_turns) - 1} more user turns.")
    if asst_turns:
        parts.append("Assistant covered: " + _preview(asst_turns[-1], limit=140))
    return " ".join(parts) if parts else ""


def _build_session_briefing(
    *,
    session_id: str,
    turn_count: int,
    first_user: str,
    messages: List[Dict[str, Any]],
) -> str:
    """Format a session-end resumption briefing memory."""
    header = (
        f"Hermes session {session_id or '(anonymous)'} ended after {turn_count} turns."
    )
    opener = _preview(first_user, limit=200)
    tail_summary = _summarise_messages(messages[-6:]) if messages else ""
    bits = [header]
    if opener:
        bits.append(f"Opened with: {opener}")
    if tail_summary:
        bits.append(tail_summary)
    return "\n".join(bits)


def _extract_memories(response: Any) -> List[Dict[str, Any]]:
    """Normalize ``memory/query`` responses to a plain list of memory dicts.

    The server may return either ``{"memories": [...]}`` or a bare list —
    we accept both and filter out non-dict entries defensively.
    """
    if isinstance(response, list):
        raw = response
    elif isinstance(response, dict):
        raw = response.get("memories") or []
    else:
        raw = []
    return [m for m in raw if isinstance(m, dict)]


def _format_memories_for_prompt(memories: List[Dict[str, Any]]) -> str:
    """Format memories as a compact markdown list for the system prompt."""
    lines = []
    for mem in memories:
        content = (mem.get("content") or "").strip()
        if not content:
            continue
        tags = mem.get("tags") or []
        category = (mem.get("category") or "").strip()
        meta_bits = []
        if category:
            meta_bits.append(category)
        if tags:
            meta_bits.append("tags: " + ", ".join(str(t) for t in tags[:4]))
        meta = f" _{' · '.join(meta_bits)}_" if meta_bits else ""
        lines.append(f"- {content}{meta}")
    return "\n".join(lines)


def _format_memories_for_prefetch(memories: List[Dict[str, Any]]) -> str:
    """Terser format for per-turn prefetch injection."""
    header = "## Chorus recall"
    body = _format_memories_for_prompt(memories)
    return f"{header}\n{body}" if body else ""


def _resolve_ring(cwd: Any, config: ChorusClientConfig) -> Optional[str]:
    """Map a working directory to a Chorus project ring.

    Auto-creation of rings on the hive happens server-side when we emit the
    first signal to a ring tag — we just need to pick a stable, lowercased
    tag here. When the cwd is missing or ``scope_by_cwd`` is off, fall back
    to ``default_ring`` (which may be ``None``).
    """
    if not config.scope_by_cwd:
        return config.default_ring

    if not cwd:
        return config.default_ring

    try:
        tag = Path(str(cwd)).name.strip().lower()
    except Exception:
        return config.default_ring

    return tag or config.default_ring


# ---------------------------------------------------------------------------
# Plugin entry point
# ---------------------------------------------------------------------------


def register(ctx) -> None:
    """Register Chorus as a memory provider plugin."""
    ctx.register_memory_provider(ChorusMemoryProvider())
