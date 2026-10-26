#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"

require_terminal
reserve_to_main preview

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

if secret_to_set preview CLOUDFLARE_API_TOKEN; then
  echo "Jeton Cloudflare « Edit Cloudflare Workers », distinct de celui de production :"
  gh secret set CLOUDFLARE_API_TOKEN --env preview
fi
if secret_to_set preview NEON_API_KEY; then
  echo "Clé d'API Neon, limitée au projet si possible :"
  gh secret set NEON_API_KEY --env preview
fi
if secret_to_set preview PREVIEW_BETTER_AUTH_SECRET; then
  openssl rand -base64 48 | gh secret set PREVIEW_BETTER_AUTH_SECRET --env preview
fi
