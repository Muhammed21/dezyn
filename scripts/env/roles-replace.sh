#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$(dirname "$0")/../.."

HYPERDRIVE_ID=ed807e2d1a7e437f9a17bb749123c6d2

branch=${1:-}
if [ -z "$branch" ]; then
  echo "Usage : pnpm roles:replace <branche Neon>" >&2
  exit 1
fi

require_terminal
require_neon_login
project=$(preview_variable NEON_PROJECT_ID)

if [ "$branch" = main ]; then
  deploy_enabled=$(gh variable get DEPLOY_ENABLED 2> /dev/null || gh variable get DEPLOY_ENABLED --env production)
  if [ "$deploy_enabled" != false ]; then
    echo "Production : passer d'abord DEPLOY_ENABLED à false, aucune migration ne doit tourner." >&2
    exit 1
  fi
  read -r -p "Remplacer les rôles de PRODUCTION : taper main pour confirmer : " typed
  if [ "$typed" != main ]; then
    echo "Abandon." >&2
    exit 1
  fi
fi

replace_role() {
  DATABASE_URL_OWNER=$owner node packages/db/scripts/replace-role.ts "$@"
}

neon_role_url() {
  neon connection-string "$branch" --project-id "$project" --role-name "$1"
}

inspect() {
  DATABASE_URL_MIGRATOR=$1 node packages/db/scripts/replace-role.ts inspect
}

owner=$(owner_url "$project" "$branch")
migrator_url=$(neon_role_url migrator)
before=$(inspect "$migrator_url")
privileged=$(jq -r '.privileged[]' <<< "$before")
if [ -z "$privileged" ]; then
  echo "Aucun rôle privilégié sur $branch : rien à faire."
  exit 0
fi
echo "Rôles privilégiés sur $branch : $(tr '\n' ' ' <<< "$privileged")"

for role in $ROLES; do
  grep -qx "$role" <<< "$privileged" || continue
  DATABASE_URL_ROLE=$(neon_role_url "$role") replace_role entrust "$role"
  if ! confirm "Supprimer le rôle Neon $role de la branche $branch ?"; then
    echo "Abandon : ${role}_keeper garde les objets et les droits de $role." >&2
    exit 1
  fi
  password=$(openssl rand -hex 24)
  deleted_at=$(date +%s)
  neon roles delete "$role" --project-id "$project" --branch "$branch" > /dev/null < /dev/null
  echo "Rôle Neon $role supprimé en $(($(date +%s) - deleted_at)) s"
  if ! PASSWORD=$password replace_role restore "$role"; then
    echo "Échec : ${role}_keeper garde les objets et les droits de $role. Relancer après correction :" >&2
    echo "DATABASE_URL_OWNER=… PASSWORD=… node packages/db/scripts/replace-role.ts restore $role" >&2
    exit 1
  fi
  if [ "$role" = migrator ]; then
    migrator_url=$(role_url "$owner" migrator "$password")
  fi
  if [ "$branch" = main ] && [ "$role" = migrator ]; then
    printf '%s' "$migrator_url" | gh secret set DATABASE_URL_MIGRATOR --env production
    echo "Secret GitHub DATABASE_URL_MIGRATOR mis à jour"
  fi
  if [ "$branch" = main ] && [ "$role" = app ]; then
    (cd apps/api && pnpm exec wrangler hyperdrive update "$HYPERDRIVE_ID" \
      --origin-user app --origin-password "$password" > /dev/null)
    echo "Hyperdrive pointe sur le nouveau app"
  fi
  echo "$role remplacé, $(($(date +%s) - deleted_at)) s après sa suppression"
done

after=$(inspect "$migrator_url")
failed=0
check() {
  if [ "$(jq -cS "$1" <<< "$after")" = "$2" ]; then
    echo "OK  $3"
  else
    echo "ÉCHEC  $3 : $(jq -cS "$1" <<< "$after")" >&2
    failed=1
  fi
}
check '.privileged' '[]' "aucun rôle privilégié"
check '.foreign' '[]' "tout appartient à migrator"
check '.history' '["INSERT"]' "app ne fait qu'ajouter à l'historique"
check '.rows' "$(jq -cS '.rows' <<< "$before")" "même nombre de lignes dans chaque table"
exit "$failed"
