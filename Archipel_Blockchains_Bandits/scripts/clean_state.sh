#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
rm -f .archipel/peers.json .archipel/trust-store.json || true
rm -rf .archipel/downloads || true
mkdir -p .archipel/downloads

echo "Etat local nettoye (.archipel)"
