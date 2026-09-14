import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/stats — token savings + activity insights for the dashboard. */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const [byAction, totals, recent, daysRaw, topMemories, memoryCounts, topSessions] = await Promise.all([
    db.usageStat.groupBy({
      by: ["action"],
      where: { userId: user.id },
      _count: { _all: true },
      _sum: { tokensSaved: true },
    }),
    db.usageStat.aggregate({
      where: { userId: user.id },
      _sum: { tokensSaved: true, tokensIn: true, tokensOut: true },
      _count: { _all: true },
    }),
    db.usageStat.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.usageStat.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 14 * 86400000) } },
      select: { action: true, tokensSaved: true, createdAt: true },
    }),
    db.memory.findMany({
      where: { userId: user.id },
      orderBy: [{ accessCount: "desc" }, { updatedAt: "desc" }],
      take: 5,
      select: { id: true, kind: true, content: true, accessCount: true, pinned: true },
    }),
    Promise.all([
      db.memory.count({ where: { userId: user.id } }),
      db.memory.count({ where: { userId: user.id, pinned: true } }),
      db.memory.count({ where: { userId: user.id, kind: "document" } }),
    ]),
    db.session.findMany({
      where: { userId: user.id, tokensSaved: { gt: 0 } },
      orderBy: { tokensSaved: "desc" },
      take: 5,
      select: { id: true, title: true, project: true, turns: true, tokensSaved: true },
    }),
  ]);

  // daily series for the last 14 days (tokens saved + event count)
  const days: { day: string; saved: number; events: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const rows = daysRaw.filter((r) => r.createdAt.toISOString().slice(0, 10) === key);
    days.push({
      day: key,
      saved: rows.reduce((a, r) => a + r.tokensSaved, 0),
      events: rows.length,
    });
  }

  const [memories, pinnedCount, documents] = memoryCounts;

  return NextResponse.json({
    totals: {
      events: totals._count._all,
      tokensSaved: totals._sum.tokensSaved ?? 0,
      tokensIn: totals._sum.tokensIn ?? 0,
      tokensOut: totals._sum.tokensOut ?? 0,
    },
    memory: { memories, pinned: pinnedCount, documents },
    byAction: byAction.map((a) => ({
      action: a.action,
      events: a._count._all,
      tokensSaved: a._sum.tokensSaved ?? 0,
    })),
    dailySaved: days,
    topMemories,
    topSessions,
    recent: recent.map((r) => ({
      id: r.id,
      action: r.action,
      tokensSaved: r.tokensSaved,
      detail: r.detail,
      createdAt: r.createdAt,
    })),
  });
}
