#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$(dirname "$0")/../.."

require_terminal
require_neon_login
project=$(preview_variable NEON_PROJECT_ID)

if ! neon branches get preview --project-id "$project" > /dev/null 2>&1; then
  neon branches create --project-id "$project" --name preview --schema-only > /dev/null
  echo "Branche Neon preview créée, schéma seul"
fi

roles=$(neon roles list --project-id "$project" --branch preview --output json | jq -r '(.roles // .)[] | .name')
for role in migrator app history_maintainer; do
  if ! grep -qx "$role" <<< "$roles"; then
    neon roles create --project-id "$project" --branch preview --name "$role" > /dev/null
    echo "Rôle $role créé"
  fi
done

owner_url=$(connection_url "$project" preview "${NEON_OWNER_ROLE:-neondb_owner}")
migrator_url=$(connection_url "$project" preview migrator)
app_url=$(connection_url "$project" preview app)
subdomain=$(preview_variable WORKERS_SUBDOMAIN)

status=0
DATABASE_URL_OWNER=$owner_url node packages/db/scripts/reset-copied-schema.ts || status=$?
if [ "$status" -ne 0 ] && [ "$status" -ne "$REFUSED" ]; then
  exit "$status"
fi

DATABASE_URL_MIGRATOR=$migrator_url pnpm --silent migrate

if [ "$status" -eq "$REFUSED" ]; then
  echo "La branche preview a déjà des données : seed sauté."
  exit 0
fi

read -r -s -p "Mot de passe du compte de démo $DEMO_EMAIL : " password
echo
auth_secret=$(openssl rand -base64 48)
DATABASE_URL=$app_url \
  BETTER_AUTH_URL="https://dezyn-api-preview.$subdomain.workers.dev" \
  BETTER_AUTH_SECRET=$auth_secret \
  pnpm --silent seed --email "$DEMO_EMAIL" --password "$password" | grep -v '^Utilisateur :'
echo "Utilisateur : $DEMO_EMAIL, avec le mot de passe saisi"
