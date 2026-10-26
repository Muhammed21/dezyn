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

if ! has_secret BETTER_AUTH_SECRET ||
  confirm "BETTER_AUTH_SECRET existe déjà. Le remplacer exige ensuite de vider identity_jwks (docs/runbooks/hebergement.md). Le remplacer ?"; then
  openssl rand -base64 48 | wrangler_api secret put BETTER_AUTH_SECRET --env="" > /dev/null
  echo "BETTER_AUTH_SECRET posé"
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
