#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
# shellcheck source=../lib.sh
source "$ROOT/scripts/env/lib.sh"

failures=0
expect_next_version() {
  local label="$1" names="$2" expected="$3" actual
  actual=$(printf '%s' "$names" | next_secret_version)
  if [ "$actual" = "$expected" ]; then
    printf '  ok    %s\n' "$label"
  else
    printf '  FAIL  %s : %s attendu, %s obtenu\n' "$label" "$expected" "$actual"
    failures=$((failures + 1))
  fi
}

echo "next_secret_version"
expect_next_version "sans version, la première est 1" $'BETTER_AUTH_SECRET\nRESEND_API_KEY' 1
expect_next_version "sans aucun secret, la première est 1" "" 1
expect_next_version "après _2 vient _3" $'BETTER_AUTH_SECRET\nBETTER_AUTH_SECRET_2' 3
expect_next_version "les versions se comparent en nombres" $'BETTER_AUTH_SECRET_10\nBETTER_AUTH_SECRET_9' 11
expect_next_version "les noms hors format sont ignorés" \
  $'BETTER_AUTH_SECRET_3\nBETTER_AUTH_SECRET_X\nBETTER_AUTH_SECRET_0\nBETTER_AUTH_SECRET_07\nBETTER_AUTH_SECRET_99a\nXBETTER_AUTH_SECRET_50' 4

[ "$failures" -eq 0 ]
