#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
export RUST_BACKTRACE="${RUST_BACKTRACE:-1}"
exec cargo tauri dev "$@"
