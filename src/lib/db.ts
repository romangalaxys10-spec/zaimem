import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

// v1.8.2 — serverless guard: SQLite under file:/tmp is ephemeral per lambda
// instance. Warn loudly so no one mistakes a warm instance for persistence.
if (process.env.VERCEL === '1' && process.env.DATABASE_URL?.startsWith('file:')) {
  console.warn(
    '[zaimem:db] EPHEMERAL STORAGE: DATABASE_URL is a local SQLite file on Vercel — ' +
      'all data is lost on every cold start. Set DATABASE_URL to a managed Postgres ' +
      'connection string (schema.postgres.prisma is used automatically by the build).'
  )
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db