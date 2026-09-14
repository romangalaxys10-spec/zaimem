#!/usr/bin/env bash
# Vercel build pipeline for ZaiMem (v1.8.2).
#
# DB strategy on Vercel:
#   - DATABASE_URL begins with postgres → Postgres deployment: generate the
#     postgres Prisma client (schema.postgres.prisma) and sync the schema.
#   - anything else (default file:/tmp/zaimem.db) → ephemeral SQLite: build
#     with the default schema. Data lives only while the lambda instance is
#     warm — swap DATABASE_URL to a managed Postgres for persistence.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${DATABASE_URL:-}" == postgres* ]]; then
  echo "[vercel-build] Postgres detected — generating postgres client + syncing schema"
  npx prisma generate --schema=prisma/schema.postgres.prisma
  npx prisma db push --schema=prisma/schema.postgres.prisma --skip-generate
else
  echo "[vercel-build] No Postgres URL set — building with ephemeral SQLite (set DATABASE_URL to postgres:// for persistence)"
  npx prisma generate
  # v1.8.3 — schema bootstrap: the lambda's /tmp database starts empty and the
  # build-time /tmp is NOT the runtime /tmp, so we ship a fresh schema-only
  # database alongside the bundle. On cold start db.ts copies it into place
  # (only when the target file is missing) — warm instances keep their data.
  rm -f db/vercel-bootstrap.db
  DATABASE_URL="file:${PWD}/db/vercel-bootstrap.db" npx prisma db push --skip-generate
  echo "[vercel-build] schema bootstrap DB created (db/vercel-bootstrap.db)"
fi

exec npx next build
