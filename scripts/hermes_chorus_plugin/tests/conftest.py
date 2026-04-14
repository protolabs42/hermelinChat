"""Pytest configuration for the Chorus hermes plugin dev tree.

The plugin source lives at ``scripts/hermes_chorus_plugin/chorus/`` in this
repo and is installed as ``~/.hermes/hermes-agent/plugins/memory/chorus/`` in
production via the installer (phase 6).

For tests we need two things to resolve:

1. The hermes ABC (``agent.memory_provider``) and the real hermes plugin
   loader (``plugins.memory``) — both live in the hermes-agent checkout.
2. Our plugin under its production import path ``plugins.memory.chorus``.

We achieve that by prepending the hermes-agent directory to ``sys.path``
(so the real ``plugins.memory`` package is importable), then manually
mounting our ``chorus/`` dev tree into ``sys.modules`` as
``plugins.memory.chorus`` with a correct ``submodule_search_locations``
so ``from plugins.memory.chorus.client import ...`` works during testing.

This keeps dev and production imports identical without shadowing the real
hermes loader or editing the live hermes install.
"""

from __future__ import annotations

import importlib
import importlib.util
import sys
from pathlib import Path


_PLUGIN_DEV_ROOT = Path(__file__).resolve().parent.parent
_CHORUS_DIR = _PLUGIN_DEV_ROOT / "chorus"
_HERMES_AGENT_ROOT = Path.home() / ".hermes" / "hermes-agent"


def _prepend_syspath(path: Path) -> None:
    s = str(path)
    if s in sys.path:
        sys.path.remove(s)
    sys.path.insert(0, s)


def _load_submodules_for_package(package_fqn: str, package_dir: Path) -> None:
    """Pre-load every ``*.py`` in ``package_dir`` so absolute imports resolve.

    We load them with ``importlib.util`` and register them in ``sys.modules``
    before the package ``__init__.py`` is executed, so that ``from
    plugins.memory.chorus.client import X`` works during ``exec_module``.
    """
    for sub in sorted(package_dir.glob("*.py")):
        if sub.name == "__init__.py":
            continue
        sub_fqn = f"{package_fqn}.{sub.stem}"
        if sub_fqn in sys.modules:
            continue
        spec = importlib.util.spec_from_file_location(sub_fqn, str(sub))
        if spec is None or spec.loader is None:
            continue
        module = importlib.util.module_from_spec(spec)
        sys.modules[sub_fqn] = module
        spec.loader.exec_module(module)


def _mount_chorus_plugin() -> None:
    """Mount our dev ``chorus/`` dir as ``plugins.memory.chorus`` in sys.modules."""
    # Force-load the real hermes loader first so ``plugins.memory`` resolves
    # to the hermes-agent package (with ``_MEMORY_PLUGINS_DIR``, discover,
    # load_memory_provider, …).
    importlib.import_module("plugins.memory")

    init_file = _CHORUS_DIR / "__init__.py"
    package_fqn = "plugins.memory.chorus"

    # Submodules first (so the __init__ can do ``from .client import ...``).
    _load_submodules_for_package(package_fqn, _CHORUS_DIR)

    spec = importlib.util.spec_from_file_location(
        package_fqn,
        str(init_file),
        submodule_search_locations=[str(_CHORUS_DIR)],
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not build import spec for {package_fqn} at {init_file}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[package_fqn] = module
    spec.loader.exec_module(module)


# Order: hermes-agent first (gives us the real loader + ABC), then mount chorus.
if _HERMES_AGENT_ROOT.is_dir():
    _prepend_syspath(_HERMES_AGENT_ROOT)

_mount_chorus_plugin()
