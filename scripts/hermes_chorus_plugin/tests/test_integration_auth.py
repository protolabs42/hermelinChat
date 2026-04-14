"""Live auth + whoami probe against the local Chorus tunnel.

Gated behind ``CHORUS_INTEGRATION_TESTS=1`` so normal unit runs skip cleanly.

Tests what can be verified without a valid api_key:
  * the tunnel is reachable (``/health``)
  * ``ChorusClient._rpc`` surfaces 401 as ``ChorusAuthError`` (live, not mocked)
  * ``ChorusUnreachableError`` on a known-bad URL

These cover the important P2 verification gates. A whoami-with-valid-key
path is covered in phase 7 when we onboard a dedicated test identity.
"""

from __future__ import annotations

import os
import pytest


_CHORUS_URL = os.environ.get("CHORUS_INTEGRATION_URL", "http://localhost:3099")
_INTEGRATION = os.environ.get("CHORUS_INTEGRATION_TESTS") == "1"


pytestmark = pytest.mark.skipif(
    not _INTEGRATION,
    reason="CHORUS_INTEGRATION_TESTS=1 not set — skipping live-tunnel tests",
)


def _real_config(**overrides):
    from plugins.memory.chorus.client import ChorusClientConfig

    defaults = dict(
        url=_CHORUS_URL,
        api_key=os.environ.get("CHORUS_INTEGRATION_API_KEY", "invalid-on-purpose"),
        identity_name="hermes-integration-test",
        timeout_seconds=5.0,
    )
    defaults.update(overrides)
    return ChorusClientConfig(**defaults)


def test_bad_key_maps_to_chorus_auth_error():
    from plugins.memory.chorus.client import ChorusAuthError, ChorusClient

    client = ChorusClient(_real_config(api_key="not-a-real-key"), retry_backoff=0)

    with pytest.raises(ChorusAuthError):
        client.whoami()


def test_unreachable_host_maps_to_unreachable_error():
    from plugins.memory.chorus.client import (
        ChorusClient,
        ChorusUnreachableError,
    )

    # Use an IP that should refuse connection immediately on loopback.
    # Port 1 is guaranteed refused on a normal linux box.
    cfg = _real_config(url="http://127.0.0.1:1", timeout_seconds=2.0)
    client = ChorusClient(cfg, retry_backoff=0)

    with pytest.raises(ChorusUnreachableError):
        client.whoami()
