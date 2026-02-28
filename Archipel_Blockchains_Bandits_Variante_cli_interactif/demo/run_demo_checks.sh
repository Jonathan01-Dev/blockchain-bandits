#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[1/4] Smoke standard"
npm run test:smoke

echo "[2/4] Smoke multi-source"
npm run test:smoke:multi

echo "[3/4] Smoke resume"
npm run test:smoke:resume

echo "[4/4] Smoke retry-timeout"
npm run test:smoke:retry

echo "All demo checks passed."
