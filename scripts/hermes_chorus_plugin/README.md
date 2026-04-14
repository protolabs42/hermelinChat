# Chorus hermes memory provider (dev)

Source of truth for the `chorus` hermes memory plugin. Shipped into the
live hermes install by the installer (phase 6, not yet wired) at
`~/.hermes/hermes-agent/plugins/memory/chorus/`.

## Layout

```
scripts/hermes_chorus_plugin/
├── chorus/                  # plugin source — copied as-is into hermes at install time
│   ├── __init__.py          # ChorusMemoryProvider + register(ctx)
│   ├── client.py            # ChorusClientConfig + (later) ChorusClient HTTP transport
│   ├── plugin.yaml          # name/version/description/deps/hooks
│   └── …                    # session.py, cli.py land in later phases
├── tests/                   # pytest, not shipped
│   ├── conftest.py          # mounts chorus/ as plugins.memory.chorus for tests
│   ├── test_config.py
│   ├── test_provider_skeleton.py
│   └── test_discovery.py
└── README.md                # this file
```

## Running the tests

Use the hermes-installed Python so the ABC (`agent.memory_provider`) and
loader (`plugins.memory`) resolve the same way they do in production:

```bash
cd hermelinChat
/home/inu/.hermes/hermes-agent/venv/bin/python3 -m pytest \
    scripts/hermes_chorus_plugin/tests -v
```

Tests run entirely against the dev tree — the live hermes install is not
modified.

## Design

See `.planning/chorus-hermes-plugin.md` for the architecture, hook→RPC
map, threading model, error policy, and per-phase verification gates.

## Beads

Parent feature: `hermelinChat-ahi`
Phases: `6uy` (design) → `wef` (skeleton) → `nb3` (auth/whoami) →
`7pe` (memory tools) → `ksr` (context injection) →
`mzg` (lifecycle hooks) → `9td` (installer) → `1wi` (live verification).
