"""End-to-end round-trip against the live Chorus tunnel.

Gated behind ``CHORUS_INTEGRATION_TESTS=1``. Reads ``CHORUS_INTEGRATION_URL``
and ``CHORUS_INTEGRATION_API_KEY`` from the environment.

What this proves:
  * ``identity/whoami`` returns a real identity with the expected shape.
  * ``memory/store`` writes a memory we can retrieve via ``memory/query``.
  * ``memory/recall`` returns the same memory by entity.
  * Memories created here are tagged ``hermes-plugin-verification`` for
    easy identification / future cleanup.
"""

from __future__ import annotations

import os
import time
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
        url=_CHORUS_URL,
        api_key=_API_KEY,
        identity_name="hermes-plugin-verification",
        timeout_seconds=8.0,
    )
    return ChorusClient(cfg, retry_backoff=0)


@pytest.fixture
def test_tag():
    """A unique tag for this test run so memories can be found + cleaned up."""
    return f"verify-{uuid.uuid4().hex[:10]}"


# ---------------------------------------------------------------------------


def test_whoami_returns_identity(real_client):
    identity = real_client.whoami()

    assert "id" in identity
    assert identity["id"].startswith("identity:")
    assert "name" in identity
    assert isinstance(identity.get("capabilities", []), list)


def test_memory_roundtrip_store_then_query(real_client, test_tag):
    unique_content = f"hermes plugin round-trip marker {test_tag}"

    identity = real_client.whoami()
    namespace = f"agent:{identity['id']}"

    store_result = real_client.memory_store(
        content=unique_content,
        entity="hermes-plugin-verification",
        category="integration-test",
        tags=["hermes-plugin-verification", test_tag],
        memory_type="episodic",
        namespace=namespace,
    )

    assert isinstance(store_result, dict)
    # Server returns either {"id": ...} or a wrapped shape — be liberal.
    memory_id = store_result.get("id") or store_result.get("memory_id")
    assert memory_id, f"no id in store response: {store_result}"

    # Eventual consistency — give the indexer a moment.
    found = []
    deadline = time.time() + 5.0
    while time.time() < deadline and not found:
        query_result = real_client.memory_query(
            query=unique_content, limit=5, tags=[test_tag], namespace=namespace,
        )
        raw = query_result.get("memories") if isinstance(query_result, dict) else query_result
        if isinstance(raw, list):
            found = [m for m in raw if isinstance(m, dict) and test_tag in (m.get("tags") or [])]
        if not found:
            time.sleep(0.3)

    assert found, f"Never retrieved stored memory via query (tag={test_tag})"
    assert any(test_tag in (m.get("tags") or []) for m in found)


def test_memory_recall_returns_stored_memory(real_client, test_tag):
    entity = f"verification-entity-{test_tag}"
    unique_content = f"recall probe content {test_tag}"

    identity = real_client.whoami()
    namespace = f"agent:{identity['id']}"

    real_client.memory_store(
        content=unique_content,
        entity=entity,
        category="integration-test",
        tags=["hermes-plugin-verification", test_tag],
        memory_type="semantic",
        namespace=namespace,
    )

    # Give the write a moment to propagate.
    time.sleep(0.3)

    recall_result = real_client.memory_recall(entity=entity)
    memories = recall_result.get("memories") if isinstance(recall_result, dict) else recall_result
    assert isinstance(memories, list)
    # Our memory should be among the entity's memories.
    contents = [m.get("content", "") for m in memories if isinstance(m, dict)]
    assert any(unique_content in c for c in contents), (
        f"recall did not return our memory for {entity!r}: got {contents!r}"
    )
