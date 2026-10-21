#!/usr/bin/env bash
# Merges every package's bench-results.json (vitest bench --outputJson) into one file, each group prefixed with its package.
# Usage: bench-collect.sh OUT_FILE
set -euo pipefail

out=${1:?usage: bench-collect.sh OUT_FILE}

mapfile -t results < <(find apps packages -name bench-results.json -not -path '*/node_modules/*' 2>/dev/null | sort)
if [ ${#results[@]} -eq 0 ]; then
  echo '{"files":[]}' >"$out"
  echo "no bench-results.json found"
  exit 0
fi

for f in "${results[@]}"; do
  jq --arg pkg "$(dirname "$f")" '.files[].groups[].fullName |= ($pkg + " > " + .)' "$f"
done | jq -s '{files: map(.files) | add}' >"$out"

empty=$(jq -r '.files[].groups[] | .fullName as $group | .benchmarks[] | select((.sampleCount // 0) == 0) | "\($group) > \(.name)"' "$out")
if [ -n "$empty" ]; then
  echo "$empty"
  echo "::error::Bench sans échantillon : vitest bench avale l'erreur du bench, relancez-le en local pour la voir."
  exit 1
fi
echo "${#results[@]} bench file(s) merged into $out"
