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
fi

exec npx next build
