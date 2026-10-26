#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$(dirname "$0")/../.."

require_terminal
if ! gh auth status > /dev/null 2>&1; then
  echo "GitHub : lancer d'abord gh auth login" >&2
  exit 1
fi
require_neon_login
project=$(preview_variable NEON_PROJECT_ID)

reserve_to_main production

deploy_enabled=$(gh variable get DEPLOY_ENABLED 2> /dev/null || true)
if [ -n "$deploy_enabled" ]; then
  echo "DEPLOY_ENABLED=$deploy_enabled, inchangée"
else
  read -r -p "DEPLOY_ENABLED manque. Déployer à chaque CI verte sur main ? [true/false, défaut false] " deploy_enabled
  if [ "${deploy_enabled:-false}" != true ] && [ "${deploy_enabled:-false}" != false ]; then
    echo "DEPLOY_ENABLED vaut true ou false." >&2
    exit 1
  fi
  gh variable set DEPLOY_ENABLED --body "${deploy_enabled:-false}"
  echo "DEPLOY_ENABLED=${deploy_enabled:-false}"
fi

if secret_to_set production CLOUDFLARE_API_TOKEN; then
  echo "Jeton Cloudflare « Edit Cloudflare Workers », distinct de celui de preview :"
  gh secret set CLOUDFLARE_API_TOKEN --env production
fi
if secret_to_set production DATABASE_URL_MIGRATOR; then
  neon_role_url "$project" "$PRODUCTION_BRANCH" migrator | gh secret set DATABASE_URL_MIGRATOR --env production
  echo "DATABASE_URL_MIGRATOR reconstruit depuis le rôle migrator de la branche $PRODUCTION_BRANCH"
fi

echo "Vérifier ensuite : pnpm prod:check"
