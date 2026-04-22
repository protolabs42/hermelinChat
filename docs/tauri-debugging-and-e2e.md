# Tauri desktop debugging + E2E workflow

This repo now has an explicit desktop debug path and an initial WebDriver-based Tauri E2E harness.

## Debugging

Run from `v2/`:

- `npm run debug:tauri`
- `npm run debug:tauri:full`

These launch `cargo tauri dev` from repo root with backtraces enabled.

Notes:
- under WSL/Linux, `MESA` / `libEGL` warnings are usually graphics-environment noise unless the UI actually fails to render
- trust the Tauri shell over browser-only impressions for startup ordering bugs
- the Rust/dev console plus WebView devtools are the source of truth

## E2E prerequisites

Linux desktop E2E uses:
- `tauri-driver`
- `WebKitWebDriver`

Install locally:

```bash
cargo install tauri-driver --locked
sudo apt-get install webkit2gtk-driver
```

Then run the doctor:

```bash
npm --prefix e2e-tests run doctor
```

## E2E run

From `v2/`:

```bash
npm run e2e:test
```

What it does:
- verifies local WebDriver prerequisites
- builds the Tauri app in debug/no-bundle mode
- starts `tauri-driver`
- launches the desktop app through WebDriver
- checks that startup UI appears and the app reaches the shell

## Current scope

This is a first real desktop smoke harness, not full product-journey coverage.

Covered now:
- window opens
- title is correct
- startup state becomes visible
- shell eventually mounts

Still worth adding later:
- workspace restore specifics
- project switching
- right-rail plan/tasks visibility
- settings flows
- MCP app surface mount flows
