NEONCTL_VERSION=2.47.0
DEMO_EMAIL=dev@dezyn.test
REFUSED=3

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

connection_url() {
  neon connection-string "$2" --project-id "$1" --role-name "$3"
}
