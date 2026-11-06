#!/usr/bin/env bash
set -euo pipefail
repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 OUTPUT_DIR [REF]" >&2
  exit 2
fi
mkdir -p "$1"
output=$(cd "$1" && pwd -P)
ref=${2:-}
if [[ -z $ref ]]; then
  ref=$(git -C "$repo" ls-remote --symref origin HEAD | awk '$1=="ref:" && $3=="HEAD"{print $2}')
  [[ $ref == refs/heads/* ]]
fi
git -C "$repo" fetch --no-tags origin "$ref" >&2
sha=$(git -C "$repo" rev-parse --verify 'FETCH_HEAD^{commit}')
work=$(mktemp -d "${TMPDIR:-/tmp}/formatter-build.XXXXXX")
trap 'rm -rf -- "$work"' EXIT
git -C "$repo" archive "$sha" | tar -x -C "$work"
(
  cd "$work"
  unset NODE_ENV
  npm ci --no-audit --no-fund >&2
  NEXT_PRIVATE_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1 npm run build >&2
)
python3 "$(dirname "$0")/package.py" "$work" "$output" "$sha"
