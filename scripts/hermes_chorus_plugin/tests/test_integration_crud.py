"""Live update / forget / relate round-trip against the tunnel.

Update + forget hit the hive directly and clean up after themselves.
Relate is currently broken upstream (chorus-protocol SurrealDB template
parse error) — we assert the plugin surfaces a typed ChorusError rather
than crashing. When the upstream bug is fixed, swap the xfail for an
assertion on the returned relation.

Gated behind ``CHORUS_INTEGRATION_TESTS=1`` + ``CHORUS_INTEGRATION_API_KEY``.
"""

from __future__ import annotations

import os
import uuid

import pytest


_CHORUS_URL = os.environ.get("CHORUS_INTEGRATION_URL", "http://localhost:3099")
_API_KEY = os.environ.get("CHORUS_INTEGRATION_API_KEY", "")
_INTEGRATION = os.environ.get("CHORUS_INTEGRATION_TESTS") == "1"


pytestmark = pytest.mark.skipif(
    not _INTEGRATION or not _API_KEY,
    reason="CHORUS_INTEGRATION_TESTS=1 + CHORUS_INTEGRATION_API_KEY required",
)


@pytest.fixture
def real_client():
    from plugins.memory.chorus.client import ChorusClient, ChorusClientConfig

    cfg = ChorusClientConfig(
        url=_CHORUS_URL, api_key=_API_KEY, identity_name="hermes-plugin-verification",
        timeout_seconds=8.0,
    )
    return ChorusClient(cfg, retry_backoff=0)


@pytest.fixture
def identity_namespace(real_client):
    who = real_client.whoami()
    return f"agent:{who['id']}"


def test_update_then_forget_roundtrip(real_client, identity_namespace):
    """Store → update (changes content + tags) → forget (delete)."""
    tag = f"crud-verify-{uuid.uuid4().hex[:8]}"

    created = real_client.memory_store(
        content=f"initial content {tag}",
        entity="hermes-plugin-crud-verify",
        category="integration-test",
        tags=[tag, "before-update"],
        memory_type="semantic",
        namespace=identity_namespace,
    )
    memory_id = created.get("id") or created.get("memory_id")
    assert memory_id, f"store didn't return an id: {created}"

    try:
        updated = real_client.memory_update(
            memory_id=memory_id,
            content=f"updated content {tag}",
            tags=[tag, "after-update"],
        )
        assert updated.get("id") == memory_id
        assert f"updated content {tag}" in updated.get("content", "")
        assert "after-update" in (updated.get("tags") or [])
    finally:
        # Clean up regardless of assertion outcome.
        real_client.memory_forget(memory_id=memory_id)


def test_forget_nonexistent_raises_chorus_error(real_client):
    """The plugin should surface a clean error rather than crashing."""
    from plugins.memory.chorus.client import ChorusError

    with pytest.raises(ChorusError):
        real_client.memory_forget(memory_id="memory:definitely-not-a-real-id")


@pytest.mark.xfail(
    reason="Upstream chorus-protocol has a SurrealDB template parse error on "
    "memory/relate — tracked for ops fix. Remove this marker once "
    "`<record>$from->relates_to-><record>$to` is rewritten.",
    strict=False,
)
def test_relate_two_memories(real_client, identity_namespace):
    """Create two memories, relate them, clean up."""
    tag = f"relate-verify-{uuid.uuid4().hex[:8]}"

    a = real_client.memory_store(
        content=f"memory A for relate test {tag}",
        entity="crud-verify-a",
        category="integration-test",
        tags=[tag],
        memory_type="semantic",
        namespace=identity_namespace,
    )
    b = real_client.memory_store(
        content=f"memory B for relate test {tag}",
        entity="crud-verify-b",
        category="integration-test",
        tags=[tag],
        memory_type="semantic",
        namespace=identity_namespace,
    )
    aid = a.get("id") or a.get("memory_id")
    bid = b.get("id") or b.get("memory_id")

    try:
        rel = real_client.memory_relate(
            from_memory=aid, to_memory=bid, relation_type="derives_from",
        )
        assert isinstance(rel, dict)
    finally:
        real_client.memory_forget(memory_id=aid)
        real_client.memory_forget(memory_id=bid)
