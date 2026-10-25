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

owner=$(owner_url "$project" preview)
migrator_password=$(openssl rand -hex 24)
app_password=$(openssl rand -hex 24)
maintainer_password=$(openssl rand -hex 24)
provision() {
  provision_roles "$owner" "$migrator_password" "$app_password" "$maintainer_password"
}

reset_schema() {
  DATABASE_URL_OWNER=$owner node packages/db/scripts/reset-copied-schema.ts
}

provisioned=0
provision || provisioned=$?
if [ "$provisioned" -eq "$PRIVILEGED" ]; then
  echo "Ces rôles viennent de Neon et sont membres de neon_superuser : remplacés par des rôles SQL."
  reset=0
  reset_schema || reset=$?
  if [ "$reset" -eq "$REFUSED" ]; then
    echo "La branche preview a des données. La supprimer, puis relancer :" >&2
    echo "npx neonctl@$NEONCTL_VERSION branches delete preview --project-id $project" >&2
    exit 1
  elif [ "$reset" -ne 0 ]; then
    exit "$reset"
  fi
  existing=$(neon roles list --project-id "$project" --branch preview --output json | jq -r 'if type == "array" then . else .roles end | .[].name')
  for role in $ROLES; do
    if grep -qx "$role" <<< "$existing"; then
      neon roles delete "$role" --project-id "$project" --branch preview > /dev/null < /dev/null
      echo "Rôle Neon $role supprimé"
    fi
  done
  provision
elif [ "$provisioned" -ne 0 ]; then
  exit "$provisioned"
fi

reset=0
reset_schema || reset=$?
if [ "$reset" -eq "$REFUSED" ]; then
  echo "La branche preview a déjà des données : remise à zéro sautée."
elif [ "$reset" -ne 0 ]; then
  exit "$reset"
fi

DATABASE_URL_MIGRATOR=$(role_url "$owner" migrator "$migrator_password") pnpm --silent migrate

subdomain=$(preview_variable WORKERS_SUBDOMAIN)
read -r -s -p "Mot de passe du compte de démo $DEMO_EMAIL : " password
echo
auth_secret=$(openssl rand -base64 48)
seeded=0
output=$(DATABASE_URL=$(role_url "$owner" app "$app_password") \
  BETTER_AUTH_URL="https://dezyn-api-preview.$subdomain.workers.dev" \
  BETTER_AUTH_SECRET=$auth_secret \
  node apps/api/scripts/seed.ts --email "$DEMO_EMAIL" --password "$password") || seeded=$?
case $seeded in
  0)
    grep -v '^Utilisateur :' <<< "$output" || true
    echo "Utilisateur : $DEMO_EMAIL, avec le mot de passe saisi"
    ;;
  "$ALREADY_SEEDED") echo "Le compte de démo $DEMO_EMAIL existe déjà : seed sauté." ;;
  *) exit "$seeded" ;;
esac
