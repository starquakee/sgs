#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [[ -x "/mnt/c/Program Files/nodejs/node.exe" ]]; then
  NODE22="/mnt/c/Program Files/nodejs/node.exe"
elif command -v node >/dev/null 2>&1; then
  NODE22="node"
else
  echo "Error: Node 22 executable not found" >&2
  exit 1
fi

echo "==> Checking Node version"
"$NODE22" -e "const major=Number(process.versions.node.split('.')[0]); if(major<22){console.error('Need Node >=22, got '+process.versions.node); process.exit(1);} console.log('Node '+process.versions.node);" < /dev/null

echo "==> Running full SGS Node test suite"
"$NODE22" --test --test-reporter=dot tests/sgs/*.test.mjs < /dev/null

echo "==> Running full production build (includes emitted callback & deployment gates)"
"$NODE22" scripts/sgs/build.mjs < /dev/null

echo "==> Running card/hero/damage/opening/recovery/music silent audio decode check"
if command -v ffmpeg.exe >/dev/null 2>&1; then
  FFMPEG=ffmpeg.exe "$NODE22" scripts/sgs/verify-card-audio.mjs < /dev/null
else
  "$NODE22" scripts/sgs/verify-card-audio.mjs < /dev/null
fi

echo "==> Final validation passed"
