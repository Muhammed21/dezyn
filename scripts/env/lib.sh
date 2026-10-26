NEONCTL_VERSION=2.47.0
DEMO_EMAIL=dev@dezyn.test
REFUSED=3
ALREADY_SEEDED=3
PRIVILEGED=4
ROLES="migrator app history_maintainer"

neon() {
  npx --yes "neonctl@$NEONCTL_VERSION" "$@"
}

require_terminal() {
  if [ ! -t 0 ]; then
    echo "Lancer cette commande dans un terminal : elle demande des valeurs masquées." >&2
    exit 1
  fi
}

require_neon_login() {
  if ! neon me > /dev/null 2>&1; then
    echo "Neon : lancer d'abord npx neonctl@$NEONCTL_VERSION auth" >&2
    exit 1
  fi
}

confirm() {
  local answer
  read -r -p "$1 [o/N] " answer
  [ "$answer" = o ] || [ "$answer" = O ]
}

preview_variable() {
  gh variable get "$1" --env preview
}

owner_url() {
  neon connection-string "$2" --project-id "$1" --role-name "${NEON_OWNER_ROLE:-neondb_owner}"
}

role_url() {
  sed -E "s#//[^@]*@#//$2:$3@#" <<< "$1"
}

provision_roles() {
  DATABASE_URL_OWNER=$1 \
    PASSWORD_MIGRATOR=$2 \
    PASSWORD_APP=$3 \
    PASSWORD_HISTORY_MAINTAINER=$4 \
    node packages/db/scripts/provision-roles.ts
}

PRODUCTION_BRANCH=production
HYPERDRIVE_ID=ed807e2d1a7e437f9a17bb749123c6d2
failed=0

verify_full() {
  sed 's/sslmode=require/sslmode=verify-full/'
}

neon_role_url() {
  neon connection-string "$2" --project-id "$1" --role-name "$3" | verify_full
}

inspect_roles() {
  DATABASE_URL_MIGRATOR=$1 node packages/db/scripts/replace-role.ts inspect
}

wrangler_api() {
  (cd apps/api && pnpm exec wrangler "$@")
}

check() {
  if [ "$2" = "$3" ]; then
    echo "OK  $1"
  else
    echo "ÉCHEC  $1 : ${2:-absent}" >&2
    failed=1
  fi
}

info() {
  echo "INFO  $1"
}

check_roles() {
  check "aucun rôle privilégié" "$(jq -r '.privileged | join(" ")' <<< "$1")" ""
  check "tout appartient à migrator" "$(jq -r '.foreign | join(" ")' <<< "$1")" ""
  check "app ne fait qu'ajouter à l'historique" "$(jq -r '.history | join(" ")' <<< "$1")" "INSERT"
}
