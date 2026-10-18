#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/.env.example"
export COMPOSE_PROJECT_NAME="dezyn-infra-test"
compose() { docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" "$@"; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

failures=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }
check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "$label"; else fail "$label"; fi
}
check_not() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then fail "$label"; else pass "$label"; fi
}

psql_as() {
  local role="$1" password="$2" database="$3" sql="$4"
  compose exec -T -e PGPASSWORD="$password" postgres \
    psql -h 127.0.0.1 -U "$role" -d "$database" -v ON_ERROR_STOP=1 -tAc "$sql"
}
psql_admin() { psql_as postgres "$POSTGRES_PASSWORD" postgres "$1"; }
psql_network() {
  local role="$1" password="$2" database="$3" sql="$4"
  compose run --rm --no-deps -T -e PGPASSWORD="$password" --entrypoint psql db-init \
    -h postgres -U "$role" -d "$database" -v ON_ERROR_STOP=1 -tAc "$sql"
}

cleanup() { compose down -v --remove-orphans >/dev/null 2>&1; }
trap cleanup EXIT
cleanup

echo "Démarrage de l'infrastructure"
check "docker/up.sh : services sains, db-init et s3-init terminés avec succès" env ENV_FILE="$ENV_FILE" "$ROOT/docker/up.sh"
check_not "docker/up.sh échoue si db-init échoue (mauvais mot de passe)" env ENV_FILE="$ENV_FILE" POSTGRES_PASSWORD=wrong "$ROOT/docker/up.sh"
check "docker/up.sh relancé avec la bonne configuration réussit" env ENV_FILE="$ENV_FILE" "$ROOT/docker/up.sh"

echo "Rôles et base"
for role in migrator app history_maintainer; do
  check "le rôle $role existe" test "$(psql_admin "SELECT count(*) FROM pg_roles WHERE rolname = '$role' AND rolcanlogin")" = "1"
done
check "migrator est propriétaire de la base $PG_DATABASE" test "$(psql_admin "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$PG_DATABASE'")" = "migrator"
check "migrator a CREATEDB (shadow database)" test "$(psql_admin "SELECT rolcreatedb FROM pg_roles WHERE rolname = 'migrator'")" = "t"
check "app n'a pas CREATEDB" test "$(psql_admin "SELECT rolcreatedb FROM pg_roles WHERE rolname = 'app'")" = "f"
check "history_maintainer n'a pas CREATEDB" test "$(psql_admin "SELECT rolcreatedb FROM pg_roles WHERE rolname = 'history_maintainer'")" = "f"
check "aucun rôle applicatif n'est superutilisateur" test "$(psql_admin "SELECT count(*) FROM pg_roles WHERE rolsuper AND rolname <> 'postgres'")" = "0"

echo "Cloisonnement de la base"
check "app se connecte à $PG_DATABASE" psql_as app "$PG_PASSWORD_APP" "$PG_DATABASE" "SELECT 1"
check "migrator se connecte à $PG_DATABASE" psql_as migrator "$PG_PASSWORD_MIGRATOR" "$PG_DATABASE" "SELECT 1"
check "app se connecte par le réseau Docker avec son mot de passe" psql_network app "$PG_PASSWORD_APP" "$PG_DATABASE" "SELECT 1"
check_not "app refusé par le réseau Docker avec un mauvais mot de passe" psql_network app wrong "$PG_DATABASE" "SELECT 1"
check_not "app ne crée pas de table dans le schéma public" psql_as app "$PG_PASSWORD_APP" "$PG_DATABASE" "CREATE TABLE infra_test_app (id int)"
check "history_maintainer se connecte à $PG_DATABASE" psql_as history_maintainer "$PG_PASSWORD_HISTORY_MAINTAINER" "$PG_DATABASE" "SELECT 1"
check_not "history_maintainer ne crée pas de table dans le schéma public" psql_as history_maintainer "$PG_PASSWORD_HISTORY_MAINTAINER" "$PG_DATABASE" "CREATE TABLE infra_test_maintainer (id int)"
check "migrator crée une table dans le schéma public" psql_as migrator "$PG_PASSWORD_MIGRATOR" "$PG_DATABASE" "CREATE TABLE infra_test_migrator (id int); DROP TABLE infra_test_migrator"

echo "Migrations (ADR 0009)"
migrate_as() { (cd "$ROOT/packages/db" && DATABASE_URL_MIGRATOR="$1" node scripts/migrate.ts); }
APP_URL="postgresql://app:${PG_PASSWORD_APP}@127.0.0.1:${POSTGRES_PORT}/${PG_DATABASE}"
check "migrator applique les migrations" migrate_as "$DATABASE_URL_MIGRATOR"
check "migrator relance les migrations sans erreur" migrate_as "$DATABASE_URL_MIGRATOR"
check "app lit la version du schéma" test "$(psql_as app "$PG_PASSWORD_APP" "$PG_DATABASE" "SELECT count(*) > 0 FROM drizzle.__drizzle_migrations")" = "t"
check_not "app n'applique pas les migrations" migrate_as "$APP_URL"
check_not "app n'écrit pas dans la table des migrations" psql_as app "$PG_PASSWORD_APP" "$PG_DATABASE" "DELETE FROM drizzle.__drizzle_migrations"
check "history_maintainer supprime dans l'historique" psql_as history_maintainer "$PG_PASSWORD_HISTORY_MAINTAINER" "$PG_DATABASE" "DELETE FROM history_entry WHERE false"
check_not "history_maintainer ne modifie pas l'historique" psql_as history_maintainer "$PG_PASSWORD_HISTORY_MAINTAINER" "$PG_DATABASE" "UPDATE history_entry SET action = action WHERE false"

echo "Idempotence de db-init"
check "db-init relancé une première fois réussit" compose run --rm db-init
check "db-init relancé une seconde fois réussit" compose run --rm db-init
check "toujours exactement un rôle migrator" test "$(psql_admin "SELECT count(*) FROM pg_roles WHERE rolname = 'migrator'")" = "1"

echo "Stockage S3"
S3_URL="http://127.0.0.1:${S3_PORT}"
SIGV4="aws:amz:${S3_REGION}:s3"
TMP="$(mktemp)"
echo "contenu de test" >"$TMP"
check "écriture authentifiée dans le bucket" curl -sf --aws-sigv4 "$SIGV4" --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" -T "$TMP" "$S3_URL/$S3_BUCKET/infra-test.txt"
check "relecture authentifiée identique" test "$(curl -sf --aws-sigv4 "$SIGV4" --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" "$S3_URL/$S3_BUCKET/infra-test.txt")" = "contenu de test"
check_not "lecture anonyme refusée" curl -sf "$S3_URL/$S3_BUCKET/infra-test.txt"
rm -f "$TMP"

echo "Mailpit"
MAIL="$(mktemp)"
printf 'From: test@dezyn.local\r\nTo: user@dezyn.local\r\nSubject: infra-test\r\n\r\nbonjour\r\n' >"$MAIL"
check "envoi SMTP accepté" curl -sf "smtp://127.0.0.1:${MAILPIT_SMTP_PORT}" --mail-from test@dezyn.local --mail-rcpt user@dezyn.local -T "$MAIL"
check "message visible dans l'API de Mailpit" sh -c "curl -sf 'http://127.0.0.1:${MAILPIT_UI_PORT}/api/v1/messages' | grep -q infra-test"
rm -f "$MAIL"

echo "Ports publiés sur 127.0.0.1 uniquement"
published="$(docker ps --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" --format '{{.Ports}}' | tr ',' '\n' | grep -- '->' || true)"
check "au moins un port publié" test -n "$published"
check_not "aucun port publié sur 0.0.0.0 ou ::" sh -c "printf '%s\n' \"$published\" | grep -Eq '0\.0\.0\.0:|\[::\]:|:::'"

echo
if [ "$failures" -eq 0 ]; then
  echo "Infrastructure : tous les tests passent"
  exit 0
fi
echo "Infrastructure : $failures échec(s)"
exit 1
