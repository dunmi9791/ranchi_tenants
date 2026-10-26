#!/bin/sh
set -e

: "${DATABASE_URL:?DATABASE_URL must be set, e.g. postgresql://ranchi:PASSWORD@db:5432/ranchi}"

if [ -z "$SESSION_SECRET" ] || [ "${#SESSION_SECRET}" -lt 32 ]; then
  echo "[entrypoint] SESSION_SECRET must be set to at least 32 characters." >&2
  exit 1
fi

echo "[entrypoint] Applying database migrations..."
prisma migrate deploy --schema=/app/prisma/schema.prisma

node /app/docker/bootstrap-admin.mjs

echo "[entrypoint] Starting Ranchi Tenants on port ${PORT:-3000}"
exec "$@"
