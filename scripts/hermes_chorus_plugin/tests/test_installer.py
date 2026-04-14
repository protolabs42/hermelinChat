"""Installer behavior against a fake target directory.

We exercise the pure copy/remove logic without touching the live hermes
install — pointing ``--target`` at a tmp dir keeps these tests fully
isolated. A separate live-install smoke check belongs in phase 7.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


INSTALLER = Path(__file__).resolve().parents[2] / "install_hermes_chorus_plugin.py"


def _run_installer(*extra_args, cwd=None):
    cmd = [sys.executable, str(INSTALLER), *extra_args]
    return subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)


def test_install_copies_plugin_into_target(tmp_path):
    result = _run_installer("--target", str(tmp_path))
    assert result.returncode == 0, f"stderr={result.stderr}"

    plugin_dir = tmp_path / "chorus"
    assert plugin_dir.is_dir()
    assert (plugin_dir / "__init__.py").is_file()
    assert (plugin_dir / "client.py").is_file()
    assert (plugin_dir / "plugin.yaml").is_file()


def test_install_is_idempotent(tmp_path):
    first = _run_installer("--target", str(tmp_path))
    second = _run_installer("--target", str(tmp_path))
    assert first.returncode == 0
    assert second.returncode == 0
    # Second invocation should report "already up to date".
    assert "already up to date" in second.stdout.lower() or "ok:" in second.stdout.lower()


def test_install_refreshes_when_source_changes(tmp_path):
    _run_installer("--target", str(tmp_path))

    # Corrupt the target, then re-install — the installer must repair it.
    bad = tmp_path / "chorus" / "__init__.py"
    bad.write_text("# clobbered\n")
    assert bad.read_text() == "# clobbered\n"

    result = _run_installer("--target", str(tmp_path))
    assert result.returncode == 0
    text = bad.read_text()
    assert "ChorusMemoryProvider" in text


def test_install_dry_run_creates_nothing(tmp_path):
    result = _run_installer("--target", str(tmp_path), "--dry-run")
    assert result.returncode == 0
    assert not (tmp_path / "chorus").exists()
    assert "DRY RUN" in result.stdout


def test_uninstall_removes_plugin(tmp_path):
    _run_installer("--target", str(tmp_path))
    assert (tmp_path / "chorus").is_dir()

    result = _run_installer("--target", str(tmp_path), "--uninstall")
    assert result.returncode == 0
    assert not (tmp_path / "chorus").exists()


def test_uninstall_on_empty_target_is_safe(tmp_path):
    result = _run_installer("--target", str(tmp_path), "--uninstall")
    assert result.returncode == 0
    assert "nothing to remove" in result.stdout.lower()


def test_installed_plugin_has_no_pycache(tmp_path):
    _run_installer("--target", str(tmp_path))
    plugin_dir = tmp_path / "chorus"
    assert plugin_dir.is_dir()
    pycache_hits = list(plugin_dir.rglob("__pycache__"))
    assert not pycache_hits, f"unexpected __pycache__ in install: {pycache_hits}"
