#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"

require_terminal
repository=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
environment="repos/$repository/environments/preview"

gh api -X PUT "$environment" \
  -F "deployment_branch_policy[protected_branches]=false" \
  -F "deployment_branch_policy[custom_branch_policies]=true" > /dev/null
if ! gh api "$environment/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx main; then
  gh api -X POST "$environment/deployment-branch-policies" -f name=main -f type=branch > /dev/null
fi
echo "Environnement GitHub preview, réservé à main"

set_variable() {
  local current value
  current=$(preview_variable "$1" 2> /dev/null || true)
  read -r -p "$2 [$current] " value
  value=${value:-$current}
  if [ -z "$value" ]; then
    echo "$1 est requise." >&2
    exit 1
  fi
  gh variable set "$1" --env preview --body "$value"
}

set_variable WORKERS_SUBDOMAIN "Sous-domaine workers.dev du compte Cloudflare"
set_variable NEON_PROJECT_ID "Identifiant du projet Neon"

to_set() {
  ! gh secret list --env preview --json name --jq '.[].name' | grep -qx "$1" ||
    confirm "$1 existe déjà. Le remplacer ?"
}

if to_set CLOUDFLARE_API_TOKEN; then
  echo "Jeton Cloudflare « Edit Cloudflare Workers », distinct de celui de production :"
  gh secret set CLOUDFLARE_API_TOKEN --env preview
fi
if to_set NEON_API_KEY; then
  echo "Clé d'API Neon, limitée au projet si possible :"
  gh secret set NEON_API_KEY --env preview
fi
if to_set PREVIEW_BETTER_AUTH_SECRET; then
  openssl rand -base64 48 | gh secret set PREVIEW_BETTER_AUTH_SECRET --env preview
fi
