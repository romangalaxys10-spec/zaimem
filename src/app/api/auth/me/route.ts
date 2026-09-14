import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — verify token & return account overview. */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const [sessions, memories, skills, ledger, savedAgg] = await Promise.all([
    db.session.count({ where: { userId: user.id } }),
    db.memory.count({ where: { userId: user.id } }),
    db.skill.count({ where: { userId: user.id, enabled: true } }),
    db.ledgerPage.count({ where: { userId: user.id } }),
    db.usageStat.aggregate({ where: { userId: user.id }, _sum: { tokensSaved: true } }),
  ]);

  return NextResponse.json({
    userId: user.id,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
    headroom: !!user.headroom,
    counts: {
      sessions,
      memories,
      skills,
      ledgerPages: ledger,
      tokensSaved: savedAgg._sum.tokensSaved ?? 0,
    },
  });
}
