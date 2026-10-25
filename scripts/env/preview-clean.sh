#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"

require_neon_login
project=$(preview_variable NEON_PROJECT_ID)

branches=$(neon branches list --project-id "$project" --output json | jq -r 'if type == "array" then . else .branches end | .[].name')
for branch in $(grep -E '^pr-[0-9]+$' <<< "$branches" || true); do
  state=$(gh pr view "${branch#pr-}" --json state --jq .state 2> /dev/null || echo UNKNOWN)
  case $state in
    CLOSED | MERGED)
      neon branches delete "$branch" --project-id "$project" > /dev/null < /dev/null
      echo "$branch supprimée : la PR est $state"
      ;;
    *) echo "$branch gardée : la PR est $state" ;;
  esac
done
