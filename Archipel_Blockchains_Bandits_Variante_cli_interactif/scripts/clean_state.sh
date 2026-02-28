#!/usr/bin/env bash
set -euo pipefail

ROOT="$(dirname "$0")/.."
cd "$ROOT"

rm -rf .archipel/downloads
rm -f .archipel/peers.json
rm -f .archipel/trust-store.json
rm -f .archipel/index.db
mkdir -p .archipel/downloads

echo "State cleaned: peers, trust store, downloads, index"
