/**
 * Shared ledger helpers — extracted from mcp.ts so non-MCP modules (meetings,
 * projects, API routes) can use them without importing the route-heavy MCP module.
 */

import { db } from "@/lib/db";

// sessionId is nullable; SQLite treats NULLs as distinct in the compound
// unique index, so null pages are matched manually instead of via upsert.

export async function findGlobalLedgerPage(userId: string, path: string) {
  const pages = await db.ledgerPage.findMany({
    where: { userId, sessionId: null, path },
    orderBy: { updatedAt: "desc" },
    take: 1,
  });
  return pages[0] ?? null;
}

export async function upsertGlobalLedgerPage(userId: string, path: string, content: string) {
  const existing = await findGlobalLedgerPage(userId, path);
  if (existing) {
    return db.ledgerPage.update({
      where: { id: existing.id },
      data: { content, updatedAt: new Date() },
    });
  }
  return db.ledgerPage.create({ data: { userId, sessionId: null, path, content } });
}
