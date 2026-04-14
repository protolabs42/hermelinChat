#!/usr/bin/env python3
"""Install the hermelinChat Chorus memory provider into the active Hermes.

Copies ``scripts/hermes_chorus_plugin/chorus/`` into the live hermes-agent
plugins directory at ``<hermes>/plugins/memory/chorus/`` so ``hermes memory
setup`` can discover and activate it.

The installer is intentionally minimal — the plugin is a self-contained
package, so install reduces to "copy directory, verify import". Idempotent
and safe to re-run after ``hermes update`` clobbers user-space additions.

Usage:
    python3 scripts/install_hermes_chorus_plugin.py [--dry-run]
    python3 scripts/install_hermes_chorus_plugin.py --uninstall

Environment:
    HERMES_EXE      Override auto-discovered hermes executable
    HERMES_PYTHON   Override auto-discovered hermes python
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
SOURCE_PLUGIN_DIR = SCRIPT_DIR / "hermes_chorus_plugin" / "chorus"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Install the Chorus memory provider plugin into the active Hermes.",
    )
    parser.add_argument(
        "--hermes-exe",
        default=os.environ.get("HERMES_EXE", "hermes"),
        help="Hermes executable to inspect (default: hermes from PATH).",
    )
    parser.add_argument(
        "--hermes-python",
        default=os.environ.get("HERMES_PYTHON", ""),
        help="Override the Python interpreter used by the Hermes installation.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Report target + planned changes, don't copy anything.",
    )
    parser.add_argument(
        "--uninstall", action="store_true",
        help="Remove the installed chorus plugin directory.",
    )
    parser.add_argument(
        "--target",
        default="",
        help="Override the plugins/memory/ destination (for tests). "
             "If set, the installer skips hermes discovery.",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Hermes discovery (mirrors install_hermes_artifact_patch.py)
# ---------------------------------------------------------------------------


def _resolve_hermes_exe(path_or_name: str) -> Path:
    candidate = Path(path_or_name).expanduser()
    if candidate.is_file():
        return candidate.resolve()
    found = shutil.which(path_or_name)
    if not found:
        raise FileNotFoundError(f"Could not find Hermes executable: {path_or_name}")
    return Path(found).resolve()


def _detect_hermes_python(hermes_exe: Path, explicit: str) -> Path:
    """Resolve Hermes's Python interpreter without resolving symlinks.

    NOTE: do not ``.resolve()`` the interpreter path. Many venvs symlink
    ``bin/python3`` to the base interpreter; Python locates the venv from
    the un-resolved argv[0]. Resolving the symlink can bypass the venv
    and make installed hermes modules silently disappear.
    """
    def _abs_no_resolve(path: Path) -> Path:
        p = path.expanduser()
        return p if p.is_absolute() else (Path.cwd() / p).absolute()

    if explicit:
        python_path = _abs_no_resolve(Path(explicit))
        if not python_path.is_file():
            raise FileNotFoundError(f"Hermes Python not found: {python_path}")
        return python_path

    try:
        first_line = hermes_exe.read_text(encoding="utf-8").splitlines()[0].strip()
    except Exception as exc:
        raise RuntimeError(f"Could not read shebang from {hermes_exe}: {exc}") from exc

    if not first_line.startswith("#!"):
        raise RuntimeError(f"Unexpected Hermes launcher format: {hermes_exe}")

    shebang = first_line[2:].strip().split()
    if not shebang:
        raise RuntimeError(f"Could not parse shebang from {hermes_exe}")

    if Path(shebang[0]).name == "env":
        if len(shebang) < 2:
            raise RuntimeError(f"env shebang missing interpreter in {hermes_exe}")
        resolved = shutil.which(shebang[1])
        if not resolved:
            raise RuntimeError(f"Could not resolve interpreter from shebang: {shebang[1]}")
        python_path = _abs_no_resolve(Path(resolved))
    else:
        python_path = _abs_no_resolve(Path(shebang[0]))

    if not python_path.is_file():
        raise FileNotFoundError(f"Hermes Python not found: {python_path}")
    return python_path


def _discover_plugins_memory_dir(hermes_python: Path) -> Path:
    """Ask the Hermes interpreter where its ``plugins.memory`` package lives."""
    code = (
        "import json, importlib.util, pathlib;"
        "spec = importlib.util.find_spec('plugins.memory');"
        "loc = list(spec.submodule_search_locations or []) if spec else [];"
        "print(json.dumps({'dir': loc[0] if loc else None}))"
    )
    result = subprocess.run(
        [str(hermes_python), "-c", code],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "Could not locate 'plugins.memory' inside the active Hermes install. "
            f"Stderr: {(result.stderr or '').strip() or '<none>'}"
        )
    try:
        data = json.loads(result.stdout.strip())
    except Exception as exc:
        raise RuntimeError(f"Could not decode plugins.memory discovery output: {result.stdout!r}") from exc

    loc = data.get("dir")
    if not loc:
        raise RuntimeError("Hermes did not report a plugins.memory directory.")

    path = Path(loc)
    if not path.is_dir():
        raise FileNotFoundError(f"Reported plugins.memory dir does not exist: {path}")
    return path


# ---------------------------------------------------------------------------
# Install / uninstall
# ---------------------------------------------------------------------------


def _verify_source() -> None:
    if not SOURCE_PLUGIN_DIR.is_dir():
        raise FileNotFoundError(f"Source plugin dir missing: {SOURCE_PLUGIN_DIR}")
    init_file = SOURCE_PLUGIN_DIR / "__init__.py"
    plugin_yaml = SOURCE_PLUGIN_DIR / "plugin.yaml"
    if not init_file.is_file():
        raise FileNotFoundError(f"Expected {init_file} in source plugin dir.")
    if not plugin_yaml.is_file():
        raise FileNotFoundError(f"Expected {plugin_yaml} in source plugin dir.")


def _install(target_plugins_memory: Path, dry_run: bool) -> tuple[bool, str]:
    destination = target_plugins_memory / "chorus"
    if dry_run:
        return False, f"DRY RUN: would install to {destination}"

    target_plugins_memory.mkdir(parents=True, exist_ok=True)

    existing_init = destination / "__init__.py"
    source_init = SOURCE_PLUGIN_DIR / "__init__.py"
    # Quick idempotency guard — compare the entry point file bytes.
    if (
        destination.is_dir()
        and existing_init.is_file()
        and existing_init.read_bytes() == source_init.read_bytes()
    ):
        # Still re-copy everything else to catch drift in other files, but
        # signal "already up to date" when nothing actually changed.
        pre = _snapshot(destination)
        _copy_tree(SOURCE_PLUGIN_DIR, destination)
        post = _snapshot(destination)
        if pre == post:
            return False, f"already up to date: {destination}"
        return True, f"refreshed existing install at {destination}"

    if destination.exists():
        shutil.rmtree(destination)
    _copy_tree(SOURCE_PLUGIN_DIR, destination)
    return True, f"installed into {destination}"


def _uninstall(target_plugins_memory: Path, dry_run: bool) -> tuple[bool, str]:
    destination = target_plugins_memory / "chorus"
    if not destination.exists():
        return False, f"nothing to remove: {destination} not present"
    if dry_run:
        return False, f"DRY RUN: would remove {destination}"
    shutil.rmtree(destination)
    return True, f"removed {destination}"


def _copy_tree(src: Path, dst: Path) -> None:
    """Copy ``src`` to ``dst``, excluding ``__pycache__`` and hidden files."""

    def ignore(_dir, names):
        return [n for n in names if n == "__pycache__" or n.startswith(".")]

    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=ignore)


def _snapshot(root: Path) -> dict[str, bytes]:
    snap: dict[str, bytes] = {}
    for path in sorted(root.rglob("*")):
        if path.is_file() and "__pycache__" not in path.parts:
            snap[str(path.relative_to(root))] = path.read_bytes()
    return snap


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------


def _verify_import(hermes_python: Path) -> None:
    """After install, ensure the plugin imports cleanly + loader sees it."""
    code = (
        "from plugins.memory.chorus import ChorusMemoryProvider, register;"
        "from plugins.memory import load_memory_provider;"
        "p = load_memory_provider('chorus');"
        "assert p is not None, 'load_memory_provider returned None';"
        "assert p.name == 'chorus', f'unexpected name {p.name!r}';"
        "print('OK')"
    )
    result = subprocess.run(
        [str(hermes_python), "-c", code],
        capture_output=True, text=True,
    )
    if result.returncode != 0 or "OK" not in result.stdout:
        raise RuntimeError(
            "Post-install import verification failed. "
            f"Stdout: {result.stdout!r} Stderr: {result.stderr!r}"
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    args = parse_args()

    try:
        _verify_source()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    hermes_python: Path | None = None
    if args.target:
        target_plugins_memory = Path(args.target).expanduser().resolve()
    else:
        try:
            hermes_exe = _resolve_hermes_exe(args.hermes_exe)
            hermes_python = _detect_hermes_python(hermes_exe, args.hermes_python)
            target_plugins_memory = _discover_plugins_memory_dir(hermes_python)
        except Exception as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1

        print("Hermes Chorus plugin install target")
        print(f"  hermes exe:    {hermes_exe}")
        print(f"  hermes python: {hermes_python}")
        print(f"  plugins.memory: {target_plugins_memory}")

    if args.uninstall:
        changed, message = _uninstall(target_plugins_memory, args.dry_run)
    else:
        changed, message = _install(target_plugins_memory, args.dry_run)

    prefix = "UPDATED" if changed else "OK"
    print(f"{prefix}: {message}")

    if args.dry_run or args.uninstall or args.target:
        return 0

    if hermes_python is not None:
        try:
            _verify_import(hermes_python)
        except Exception as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
        print("VERIFIED: plugins.memory.chorus imports and loads cleanly.")

    print()
    print("Next steps")
    print("  1) Run `hermes memory setup` and pick 'chorus'.")
    print("  2) Ensure chorus-tunnel.service is running (localhost:3099).")
    print("  3) Test: `hermes chat` — the system prompt should include a Chorus block.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
