#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$(dirname "$0")/../.."

require_terminal
if ! wrangler_api whoami 2> /dev/null | grep -q "You are logged in"; then
  echo "Cloudflare : lancer d'abord npx wrangler login dans apps/api" >&2
  exit 1
fi

worker_secrets=$(wrangler_api secret list --env="" --format json 2> /dev/null | jq -r '.[].name')
has_secret() {
  grep -qx "$1" <<< "$worker_secrets"
}

expire_keys() {
  local current=$1 url stale
  require_neon_login
  url=$(neon_role_url "$(preview_variable NEON_PROJECT_ID)" "$PRODUCTION_BRANCH" migrator)
  echo "Clés de signature expirées : $(expire_signing_keys "$url")"
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" || true)" != 200 ]; then
    echo "$HEALTH_URL ne répond pas 200 : vérifier avec pnpm prod:check" >&2
  fi
  stale=$(stale_secret_versions "$(secret_versions_in_use "$url")" "$current")
  if [ -n "$stale" ]; then
    echo "Des clés valides dépendent encore de : $(tr '\n' ' ' <<< "$stale")"
    echo "Une instance servait encore l'ancienne version du Worker : relancer dans une minute pnpm prod:secrets --expire-keys"
  else
    echo "Les anciennes versions sont retirables : voir pnpm prod:check"
  fi
}

current=$(($(next_secret_version <<< "$worker_secrets") - 1))
if [ "${1:-}" = --expire-keys ]; then
  if [ "$current" -eq 0 ]; then
    echo "Aucune version BETTER_AUTH_SECRET_<N> : rien à expirer" >&2
    exit 1
  fi
  expire_keys "$current"
  exit 0
fi

if ! has_secret BETTER_AUTH_SECRET; then
  openssl rand -base64 48 | wrangler_api secret put BETTER_AUTH_SECRET --env="" > /dev/null
  echo "BETTER_AUTH_SECRET posé"
elif confirm "Ajouter BETTER_AUTH_SECRET_$((current + 1)) ? Les sessions web en cours se fermeront."; then
  openssl rand -base64 48 | wrangler_api secret put "BETTER_AUTH_SECRET_$((current + 1))" --env="" > /dev/null
  echo "BETTER_AUTH_SECRET_$((current + 1)) posé"
  echo "Une fois la nouvelle version du Worker propagée, dans une minute, terminer la rotation :"
  echo "  pnpm prod:secrets --expire-keys"
fi

if has_secret RESEND_API_KEY; then
  question="RESEND_API_KEY existe déjà. Le remplacer ?"
else
  question="Poser RESEND_API_KEY ?"
fi
if confirm "$question"; then
  wrangler_api secret put RESEND_API_KEY --env=""
elif ! has_secret RESEND_API_KEY; then
  echo "RESEND_API_KEY absent : les emails ne partent pas."
fi

echo "Chaque secret posé publie aussitôt une nouvelle version du Worker, avec le code déployé."
echo "Vérifier ensuite : pnpm prod:check"
