#!/bin/sh
set -eu

run() {
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -U postgres -d postgres "$@"
}

ensure_role() {
  role="$1"
  password="$2"
  attributes="$3"
  run -q -v role="$role" -v password="$password" -v attributes="$attributes" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEROLE %s PASSWORD %L', :'role', :'attributes', :'password') \gexec
SQL
}

ensure_database() {
  database="$1"
  owner="$2"
  run -q -v database="$database" -v owner="$owner" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'owner')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'database') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'owner') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'database') \gexec
SQL
}

grant_connect() {
  database="$1"
  role="$2"
  run -q -v database="$database" -v role="$role" <<'SQL'
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role') \gexec
SQL
}

ensure_role migrator "$PG_PASSWORD_MIGRATOR" CREATEDB
ensure_role app "$PG_PASSWORD_APP" NOCREATEDB

ensure_database "$PG_DATABASE" migrator

grant_connect "$PG_DATABASE" migrator
grant_connect "$PG_DATABASE" app

echo "db-init : rôles et base à jour"
