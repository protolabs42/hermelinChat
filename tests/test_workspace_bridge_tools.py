import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path


def _load_artifact_tool_module():
    module_path = Path(__file__).resolve().parents[1] / "scripts" / "hermes_artifact_patch" / "artifact_tool.py"
    spec = importlib.util.spec_from_file_location("artifact_tool_for_workspace_bridge_tests", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load artifact tool module from {module_path}")

    class _DummyRegistry:
        def register(self, *args, **kwargs):
            return None

    registry_module = types.ModuleType("tools.registry")
    registry_module.registry = _DummyRegistry()
    tools_module = types.ModuleType("tools")
    tools_module.registry = registry_module
    sys.modules.setdefault("tools", tools_module)
    sys.modules["tools.registry"] = registry_module

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_install_patch_module():
    module_path = Path(__file__).resolve().parents[1] / "scripts" / "install_hermes_artifact_patch.py"
    spec = importlib.util.spec_from_file_location("install_hermes_artifact_patch_for_workspace_bridge_tests", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class WorkspaceBridgeToolTests(unittest.TestCase):
    def test_install_patch_registers_workspace_bridge_tools_in_artifacts_toolset(self):
        module = _load_install_patch_module()
        block = module.ARTIFACT_TOOLSETS_BLOCK

        artifacts_section = block.split('"artifacts": {', 1)[1].split('"strudel": {', 1)[0]
        self.assertIn('"open_workspace"', artifacts_section)
        self.assertIn('"split_pane"', artifacts_section)
        self.assertIn('"focus_panel"', artifacts_section)
        self.assertIn('"arrange_layout"', artifacts_section)
        self.assertIn('"close_panel"', artifacts_section)

    def test_open_workspace_queues_workspace_bridge_command(self):
        tool_module = _load_artifact_tool_module()

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            artifacts_home = tmp / "artifacts"
            tool_module.HERMES_HOME = str(tmp)
            tool_module.ARTIFACTS_HOME = str(artifacts_home)
            tool_module.BRIDGE_DIR = str(artifacts_home / "bridge")
            tool_module.BRIDGE_COMMANDS_DIR = str(artifacts_home / "bridge" / "commands")
            tool_module.BRIDGE_RESPONSES_DIR = str(artifacts_home / "bridge" / "responses")
            tool_module.BRIDGE_STATE_DIR = str(artifacts_home / "bridge" / "state")

            result = json.loads(tool_module.open_workspace(name="Aurora Lab", create_if_missing=False))
            command_path = Path(result["path"])
            command = json.loads(command_path.read_text(encoding="utf-8"))

        self.assertEqual(result["status"], "queued")
        self.assertEqual(result["channel"], "workspace")
        self.assertEqual(result["command"], "open-workspace")
        self.assertEqual(command["payload"], {"name": "Aurora Lab", "create_if_missing": False})

    def test_workspace_commands_encode_expected_payloads(self):
        tool_module = _load_artifact_tool_module()

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            artifacts_home = tmp / "artifacts"
            tool_module.HERMES_HOME = str(tmp)
            tool_module.ARTIFACTS_HOME = str(artifacts_home)
            tool_module.BRIDGE_DIR = str(artifacts_home / "bridge")
            tool_module.BRIDGE_COMMANDS_DIR = str(artifacts_home / "bridge" / "commands")
            tool_module.BRIDGE_RESPONSES_DIR = str(artifacts_home / "bridge" / "responses")
            tool_module.BRIDGE_STATE_DIR = str(artifacts_home / "bridge" / "state")

            split = json.loads(tool_module.split_pane(direction="right", workspace_id="ws-1", target="plan", ratio=0.4))
            focus = json.loads(tool_module.focus_panel(target="tasks", workspace_id="ws-1"))
            layout = json.loads(
                tool_module.arrange_layout(
                    spec_json=json.dumps({"mode": "stacked", "primaryPane": "plan", "secondaryPane": "tasks"})
                )
            )
            close = json.loads(tool_module.close_panel(target="artifacts", workspace_id="ws-1"))

            commands_dir = Path(tool_module.BRIDGE_COMMANDS_DIR)
            payloads = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(commands_dir.glob("*.json"))]

        self.assertEqual(split["command"], "split-pane")
        self.assertEqual(focus["command"], "focus-panel")
        self.assertEqual(layout["command"], "arrange-layout")
        self.assertEqual(close["command"], "close-panel")

        self.assertEqual(payloads[0]["payload"], {"direction": "right", "workspace_id": "ws-1", "target": "plan", "ratio": 0.4})
        self.assertEqual(payloads[1]["payload"], {"target": "tasks", "workspace_id": "ws-1"})
        self.assertEqual(payloads[2]["payload"], {"spec": {"mode": "stacked", "primaryPane": "plan", "secondaryPane": "tasks"}})
        self.assertEqual(payloads[3]["payload"], {"target": "artifacts", "workspace_id": "ws-1"})

    def test_workspace_bridge_rejects_invalid_ratio_and_coerces_false_string(self):
        tool_module = _load_artifact_tool_module()

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            artifacts_home = tmp / "artifacts"
            tool_module.HERMES_HOME = str(tmp)
            tool_module.ARTIFACTS_HOME = str(artifacts_home)
            tool_module.BRIDGE_DIR = str(artifacts_home / "bridge")
            tool_module.BRIDGE_COMMANDS_DIR = str(artifacts_home / "bridge" / "commands")
            tool_module.BRIDGE_RESPONSES_DIR = str(artifacts_home / "bridge" / "responses")
            tool_module.BRIDGE_STATE_DIR = str(artifacts_home / "bridge" / "state")

            invalid_ratio = json.loads(tool_module.split_pane(direction="right", ratio=1.0))
            opened = json.loads(tool_module.open_workspace(name="Aurora Lab", create_if_missing="false"))
            queued = json.loads(Path(opened["path"]).read_text(encoding="utf-8"))

        self.assertEqual(invalid_ratio["error"], "ratio must be between 0 and 1")
        self.assertFalse(queued["payload"]["create_if_missing"])


if __name__ == "__main__":
    unittest.main()
