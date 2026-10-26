#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$(dirname "$0")/../.."

branch=${1:-$PRODUCTION_BRANCH}

require_neon_login
project=$(preview_variable NEON_PROJECT_ID)
owner=$(owner_url "$project" "$branch" | verify_full)
migrator_password=$(openssl rand -hex 24)
app_password=$(openssl rand -hex 24)

status=0
created=$(DATABASE_URL_OWNER=$owner \
  PASSWORD_MIGRATOR=$migrator_password \
  PASSWORD_APP=$app_password \
  PASSWORD_HISTORY_MAINTAINER=$(openssl rand -hex 24) \
  node packages/db/scripts/create-missing-roles.ts) || status=$?
if [ "$status" -eq "$PRIVILEGED" ]; then
  echo "Remplacer d'abord ces rôles : pnpm roles:replace $branch" >&2
  exit 1
elif [ "$status" -ne 0 ]; then
  exit "$status"
fi
if [ -z "$created" ]; then
  echo "Rôles migrator, app et history_maintainer déjà présents sur $branch"
else
  echo "Rôles créés en SQL sur $branch : $(tr '\n' ' ' <<< "$created")"
fi

is_created() {
  grep -qx "$1" <<< "$created"
}

if is_created migrator; then
  migrator_url=$(role_url "$owner" migrator "$migrator_password")
else
  migrator_url=$(neon_role_url "$project" "$branch" migrator)
fi
repair_credentials() {
  echo "Identifiants de production à reposer :" >&2
  echo "- DATABASE_URL_MIGRATOR : pnpm prod:github" >&2
  echo "- Hyperdrive : (cd apps/api && npx wrangler hyperdrive update $HYPERDRIVE_ID --origin-user app --origin-password \"\$(npx neonctl@$NEONCTL_VERSION connection-string $PRODUCTION_BRANCH --project-id $project --role-name app | sed -E 's#^[^:]*://[^:]*:([^@]*)@.*#\\1#')\")" >&2
}

if [ "$branch" = "$PRODUCTION_BRANCH" ]; then
  trap repair_credentials ERR
  if is_created migrator; then
    printf '%s' "$migrator_url" | gh secret set DATABASE_URL_MIGRATOR --env production
    echo "Secret GitHub DATABASE_URL_MIGRATOR posé"
  fi
  if is_created app; then
    wrangler_api hyperdrive update "$HYPERDRIVE_ID" \
      --origin-user app --origin-password "$app_password" > /dev/null
    echo "Hyperdrive pointe sur app"
  fi
  trap - ERR
fi

DATABASE_URL_MIGRATOR=$migrator_url pnpm --silent migrate

echo "Vérifier ensuite : pnpm prod:check $branch"
