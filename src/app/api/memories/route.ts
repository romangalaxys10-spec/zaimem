import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { recallMemories, decayCandidates } from "@/lib/zaimem/memory";

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
  const view = req.nextUrl.searchParams.get("view") ?? "";

  // decay candidates — memories that no longer earn their place
  if (view === "decay") {
    const candidates = await decayCandidates(user.id);
    return NextResponse.json({ memories: candidates, mode: "decay" });
  }

  if (q) {
    const hits = await recallMemories({ userId: user.id, query: q, limit: Math.min(40, limit), project: req.nextUrl.searchParams.get("project") || null });
    return NextResponse.json({
      memories: hits.map((h) => ({
        id: h.id,
        kind: h.kind,
        content: h.content,
        score: h.score,
        sessionId: h.sessionId,
        source: h.source,
        pinned: h.pinned,
        details: h.details,
        accessCount: h.accessCount,
        createdAt: h.createdAt,
      })),
      mode: "vector_search",
    });
  }

  const [rows, pinnedRows] = await Promise.all([
    db.memory.findMany({
      where: { userId: user.id, pinned: false },
      orderBy: { updatedAt: "desc" },
      take: Math.min(100, limit),
      select: {
        id: true, kind: true, content: true, keywords: true, importance: true,
        accessCount: true, sessionId: true, source: true, pinned: true, project: true,
        quarantined: true, archived: true, supersededBy: true, createdAt: true, updatedAt: true,
      },
    }),
    db.memory.findMany({
      where: { userId: user.id, pinned: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true, kind: true, content: true, keywords: true, importance: true,
        accessCount: true, sessionId: true, source: true, pinned: true, project: true,
        quarantined: true, archived: true, supersededBy: true, createdAt: true, updatedAt: true,
      },
    }),
  ]);
  return NextResponse.json({ memories: [...pinnedRows, ...rows].slice(0, Math.min(100, limit)), mode: "recent" });
}
