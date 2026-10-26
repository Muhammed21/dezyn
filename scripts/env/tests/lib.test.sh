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

expect_output() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  ok    %s\n' "$label"
  else
    printf '  FAIL  %s : %q attendu, %q obtenu\n' "$label" "$expected" "$actual"
    failures=$((failures + 1))
  fi
}

echo "secrets_for_versions"
expect_output "legacy désigne BETTER_AUTH_SECRET, N désigne BETTER_AUTH_SECRET_N" \
  $'BETTER_AUTH_SECRET\nBETTER_AUTH_SECRET_2\nBETTER_AUTH_SECRET_10' \
  "$(printf 'legacy\n2\n10' | secrets_for_versions)"
expect_output "aucune version, aucun secret" "" "$(printf '' | secrets_for_versions)"

echo "retirable_secret_versions"
expect_output "une version dont aucune clé ne dépend se retire" \
  BETTER_AUTH_SECRET_2 \
  "$(retirable_secret_versions $'BETTER_AUTH_SECRET\nBETTER_AUTH_SECRET_2\nBETTER_AUTH_SECRET_3' 3)"
expect_output "une version dont une clé dépend reste" \
  "" \
  "$(retirable_secret_versions $'BETTER_AUTH_SECRET_2\nBETTER_AUTH_SECRET_3' $'2\n3')"
expect_output "la version la plus haute reste, même sans clé" \
  BETTER_AUTH_SECRET_2 \
  "$(retirable_secret_versions $'BETTER_AUTH_SECRET_2\nBETTER_AUTH_SECRET_10' legacy)"
expect_output "les versions à retirer sont rangées en nombres" \
  $'BETTER_AUTH_SECRET_2\nBETTER_AUTH_SECRET_9\nBETTER_AUTH_SECRET_10' \
  "$(retirable_secret_versions $'BETTER_AUTH_SECRET_10\nBETTER_AUTH_SECRET_9\nBETTER_AUTH_SECRET_2\nBETTER_AUTH_SECRET_11' "")"
expect_output "BETTER_AUTH_SECRET et les noms hors format ne se retirent pas" \
  "" \
  "$(retirable_secret_versions $'BETTER_AUTH_SECRET\nBETTER_AUTH_SECRET_X\nBETTER_AUTH_SECRET_07\nRESEND_API_KEY\nBETTER_AUTH_SECRET_4' "")"
expect_output "la version 1 ne se confond pas avec la 10" \
  BETTER_AUTH_SECRET_1 \
  "$(retirable_secret_versions $'BETTER_AUTH_SECRET_1\nBETTER_AUTH_SECRET_10\nBETTER_AUTH_SECRET_11' 10)"

echo "stale_secret_versions"
expect_output "les versions autres que la courante restent à expirer" \
  $'legacy\n2' "$(stale_secret_versions $'legacy\n2\n3' 3)"
expect_output "seule la version courante, rien à expirer" "" "$(stale_secret_versions 3 3)"
expect_output "aucune clé valide, rien à expirer" "" "$(stale_secret_versions "" 3)"
expect_output "la version 13 ne se confond pas avec la 3" 13 "$(stale_secret_versions $'3\n13' 3)"

[ "$failures" -eq 0 ]
