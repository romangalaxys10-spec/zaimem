import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { recallMemories } from "@/lib/zaimem/memory";

export const dynamic = "force-dynamic";

/**
 * GET /api/memories?q=<query>&limit=…
 *   — with q: vector semantic search (same engine the MCP tool uses)
 *   — without q: most recent memories
 */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "40");

  if (q) {
    const hits = await recallMemories({ userId: user.id, query: q, limit: Math.min(40, limit) });
    return NextResponse.json({
      memories: hits.map((h) => ({
        id: h.id,
        kind: h.kind,
        content: h.content,
        score: h.score,
        sessionId: h.sessionId,
        accessCount: h.accessCount,
        createdAt: h.createdAt,
      })),
      mode: "vector_search",
    });
  }

  const rows = await db.memory.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: Math.min(100, limit),
    select: {
      id: true, kind: true, content: true, keywords: true, importance: true,
      accessCount: true, sessionId: true, createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json({ memories: rows, mode: "recent" });
}
