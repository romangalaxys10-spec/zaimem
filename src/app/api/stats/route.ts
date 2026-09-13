import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/stats — token savings + activity feed for the dashboard. */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const [byAction, totals, recent, daysRaw] = await Promise.all([
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
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      select: { action: true, tokensSaved: true, createdAt: true },
    }),
  ]);

  // daily savings for the last 7 days
  const days: { day: string; saved: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const saved = daysRaw
      .filter((r) => r.createdAt.toISOString().slice(0, 10) === key)
      .reduce((a, r) => a + r.tokensSaved, 0);
    days.push({ day: key, saved });
  }

  return NextResponse.json({
    totals: {
      events: totals._count._all,
      tokensSaved: totals._sum.tokensSaved ?? 0,
      tokensIn: totals._sum.tokensIn ?? 0,
      tokensOut: totals._sum.tokensOut ?? 0,
    },
    byAction: byAction.map((a) => ({
      action: a.action,
      events: a._count._all,
      tokensSaved: a._sum.tokensSaved ?? 0,
    })),
    dailySaved: days,
    recent: recent.map((r) => ({
      id: r.id,
      action: r.action,
      tokensSaved: r.tokensSaved,
      detail: r.detail,
      createdAt: r.createdAt,
    })),
  });
}
