"""Exercises the real hermes loader against our dev tree.

Guards the P1 verification gate: ``discover_memory_providers()`` must see
the chorus plugin, extract its description from ``plugin.yaml``, and report
``is_available=False`` when no Chorus config exists.
"""

from __future__ import annotations

from pathlib import Path

import pytest


_DEV_ROOT = Path(__file__).resolve().parent.parent  # scripts/hermes_chorus_plugin/


@pytest.fixture
def isolated_env(monkeypatch, tmp_path):
    for key in (
        "CHORUS_URL",
        "CHORUS_API_KEY",
        "CHORUS_IDENTITY_NAME",
        "CHORUS_RECALL_MODE",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("HOME", str(tmp_path))
    return tmp_path


def test_hermes_loader_discovers_chorus_plugin(isolated_env, monkeypatch):
    """Point the real hermes loader at our dev tree and assert discovery.

    ``_MEMORY_PLUGINS_DIR`` is the directory the loader scans — we point it
    at our dev root so it finds ``chorus/`` without touching the live install.
    """
    import plugins.memory as loader_pkg

    monkeypatch.setattr(loader_pkg, "_MEMORY_PLUGINS_DIR", _DEV_ROOT)

    results = loader_pkg.discover_memory_providers()
    names = {name for name, _desc, _avail in results}
    assert "chorus" in names, f"chorus not in discovered providers: {names}"

    by_name = {name: (desc, avail) for name, desc, avail in results}
    desc, avail = by_name["chorus"]
    assert "chorus" in desc.lower()
    assert avail is False  # no config written yet


def test_hermes_loader_load_memory_provider_returns_instance(isolated_env, monkeypatch):
    from agent.memory_provider import MemoryProvider
    import plugins.memory as loader_pkg

    monkeypatch.setattr(loader_pkg, "_MEMORY_PLUGINS_DIR", _DEV_ROOT)

    provider = loader_pkg.load_memory_provider("chorus")
    assert provider is not None
    assert isinstance(provider, MemoryProvider)
    assert provider.name == "chorus"


def test_hermes_loader_reports_available_after_config(isolated_env, monkeypatch):
    """Once config is present, availability flips to True."""
    import plugins.memory as loader_pkg

    monkeypatch.setattr(loader_pkg, "_MEMORY_PLUGINS_DIR", _DEV_ROOT)

    (isolated_env / "chorus.json").write_text(
        '{"url": "http://localhost:3099", "api_key": "sk-test"}'
    )

    results = loader_pkg.discover_memory_providers()
    by_name = {name: avail for name, _desc, avail in results}
    assert by_name.get("chorus") is True
