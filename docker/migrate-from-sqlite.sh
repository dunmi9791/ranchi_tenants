#!/bin/sh
# One-off move of a pre-Postgres deployment's SQLite database into Postgres. Run with the app
# stopped and Postgres empty (README, "Upgrading a SQLite deployment"):
#
#   docker compose run --rm --entrypoint /app/docker/migrate-from-sqlite.sh app
#
# Reads the old database from the ranchi-data volume (read-only), works on a copy in /tmp, and
# leaves the original untouched for rollback.
set -e

SOURCE=${SQLITE_FILE:-/app/data/ranchi.db}
WORK=/tmp/ranchi-migrate.db

: "${DATABASE_URL:?DATABASE_URL must be set to the Postgres URL (see .env.docker.example)}"
case "$DATABASE_URL" in
  postgres*) ;;
  *) echo "[migrate] DATABASE_URL must be a postgresql:// URL, not $DATABASE_URL" >&2; exit 1 ;;
esac
[ -f "$SOURCE" ] || { echo "[migrate] No SQLite database at $SOURCE. Is the ranchi-data volume mounted?" >&2; exit 1; }

cp "$SOURCE" "$WORK"
echo "[migrate] Bringing the SQLite copy up to date..."
DATABASE_URL="file:$WORK" prisma migrate deploy --schema=/app/prisma/sqlite/schema.prisma

echo "[migrate] Creating the Postgres tables..."
prisma migrate deploy --schema=/app/prisma/schema.prisma

echo "[migrate] Copying data..."
node /app/docker/sqlite-to-postgres.mjs "$WORK"
rm -f "$WORK"
