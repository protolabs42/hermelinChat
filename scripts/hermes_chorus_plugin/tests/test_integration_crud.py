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


def test_graph_traversal_and_edge_lifecycle(real_client, identity_namespace):
    """Full graph lifecycle: store A+B → relate → edges/graph → update → delete → verify gone."""
    tag = f"graph-verify-{uuid.uuid4().hex[:8]}"

    a = real_client.memory_store(
        content=f"graph node A {tag}", entity="graph-verify",
        category="integration-test", tags=[tag, "a"],
        memory_type="semantic", namespace=identity_namespace,
    )
    b = real_client.memory_store(
        content=f"graph node B {tag}", entity="graph-verify",
        category="integration-test", tags=[tag, "b"],
        memory_type="semantic", namespace=identity_namespace,
    )
    aid = a.get("id") or a.get("memory_id")
    bid = b.get("id") or b.get("memory_id")

    try:
        rel = real_client.memory_relate(
            from_memory=aid, to_memory=bid, relation_type="derives_from",
            strength=0.6, metadata={"tag": tag},
        )
        edge_id = rel["id"]
        assert edge_id.startswith("relates_to:")

        # graph traversal from A should surface B
        graph = real_client.memory_graph(memory_id=aid)
        memories = graph.get("memories") if isinstance(graph, dict) else graph
        assert isinstance(memories, list)
        assert any(m.get("id") == bid for m in memories), \
            f"graph traversal didn't surface {bid}: {memories!r}"

        # edges for A should list our new edge
        edges = real_client.memory_edges(memory_id=aid)
        edge_list = edges.get("edges") if isinstance(edges, dict) else edges
        assert any(e.get("id") == edge_id for e in edge_list), \
            f"edges list missing {edge_id}: {edge_list!r}"

        # update strength
        updated = real_client.memory_update_edge(
            edge_id=edge_id, strength=0.95, metadata={"confirmed": True},
        )
        assert updated.get("strength") == 0.95
        assert updated.get("metadata", {}).get("confirmed") is True

        # delete edge
        deleted = real_client.memory_delete_edge(edge_id=edge_id)
        assert deleted is None or deleted.get("deleted") is True

        # verify edges list is now empty
        edges_after = real_client.memory_edges(memory_id=aid)
        edge_list_after = edges_after.get("edges") if isinstance(edges_after, dict) else edges_after
        assert not any(e.get("id") == edge_id for e in (edge_list_after or [])), \
            "edge still present after delete"
    finally:
        real_client.memory_forget(memory_id=aid)
        real_client.memory_forget(memory_id=bid)


def test_relate_two_memories(real_client, identity_namespace):
    """Create two memories, relate them, clean up.

    Upstream fixed in chorus-protocol (GH-26). The server now returns a
    proper relation object with in/out/relation_type/strength on the
    ``relates_to:*`` edge record.
    """
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
        assert isinstance(rel, dict), f"unexpected relate result: {rel!r}"
        assert rel.get("id", "").startswith("relates_to:"), f"no relation id: {rel}"
        assert rel.get("in") == aid
        assert rel.get("out") == bid
        assert rel.get("relation_type") == "derives_from"
    finally:
        real_client.memory_forget(memory_id=aid)
        real_client.memory_forget(memory_id=bid)
