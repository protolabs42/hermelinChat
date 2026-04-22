#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
npm --prefix e2e-tests test
