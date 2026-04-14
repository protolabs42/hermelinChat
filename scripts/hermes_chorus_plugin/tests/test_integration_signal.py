"""Live-emit integration against ``POST /emit`` on the real tunnel.

Catches the class of bug that shipped in v1: an internally-consistent
mock suite that agreed with the plugin's (wrong) RPC path. Live tests
hit the real endpoint and would reject that shape immediately.

Gated behind ``CHORUS_INTEGRATION_TESTS=1`` + ``CHORUS_INTEGRATION_API_KEY``.
"""

from __future__ import annotations

import os
import uuid

import pytest


_CHORUS_URL = os.environ.get("CHORUS_INTEGRATION_URL", "http://localhost:3099")
_API_KEY = os.environ.get("CHORUS_INTEGRATION_API_KEY", "")
_FROM_ROLE = os.environ.get("CHORUS_INTEGRATION_FROM_ROLE", "dev")
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


def test_signal_emit_live_creates_signal(real_client):
    """Round-trip a pulse signal through the real /emit endpoint."""
    marker = f"signal-emit-verify-{uuid.uuid4().hex[:8]}"

    signal = real_client.signal_emit(
        signal_type="pulse",
        content=f"integration test probe {marker}",
        from_role=_FROM_ROLE,
        urgency=0.05,
        tags=["hermes-plugin-verification", marker],
    )

    assert isinstance(signal, dict)
    # REST ``/emit`` returns the created signal with id + metadata.
    assert signal.get("id", "").startswith("signal:"), f"unexpected emit result: {signal}"
    assert signal.get("signal_type") == "pulse"
    assert marker in signal.get("content", "")


def test_signal_emit_live_with_bad_role_surfaces_role_not_held(real_client):
    """Emitting from a role the identity doesn't hold yields a typed error."""
    from plugins.memory.chorus.client import ChorusPermissionError, ChorusError

    with pytest.raises((ChorusPermissionError, ChorusError)) as excinfo:
        real_client.signal_emit(
            signal_type="pulse",
            content="bad-role probe",
            from_role="__definitely_not_a_real_role__",
        )
    # The message should hint at the failure mode.
    assert "role" in str(excinfo.value).lower() or "not held" in str(excinfo.value).lower() or "unknown" in str(excinfo.value).lower()
