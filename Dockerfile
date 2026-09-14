# ── ZaiMem production image ──────────────────────────────────────────────────
# Multi-stage: bun installs deps → next build (standalone) → slim node runtime.
# Data lives in /app/db (mount a volume there to persist the SQLite database).

# 1 · deps ────────────────────────────────────────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 2 · build ───────────────────────────────────────────────────────────────────
FROM oven/bun:1 AS build
WORKDIR /app
ENV DATABASE_URL="file:./build.db"
ENV ZAIMEM_SCHEDULER=off
# v1.8.3: standalone output is opt-in via NEXT_OUTPUT_MODE so the same
# next.config stays Vercel-clean (standalone broke Vercel's function trace)
ENV NEXT_OUTPUT_MODE=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
# package.json build script: next build && copies static+public into standalone
RUN bun run build

# 3 · runtime ─────────────────────────────────────────────────────────────────
# node:22-slim (debian bookworm) matches the prisma engine target built above
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL="file:/app/db/custom.db"

# prisma client + query engine (same debian target as the build stage)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/prisma ./prisma

# standalone app (server.js + traced deps + .next/static + public)
COPY --from=build /app/.next/standalone ./

RUN mkdir -p /app/db
VOLUME ["/app/db"]
EXPOSE 3000

CMD ["node", "server.js"]
