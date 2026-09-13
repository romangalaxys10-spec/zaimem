import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/sessions — list synced sessions with counts. */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const sessions = await db.session.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 60,
    include: {
      _count: { select: { memories: true, ledgerPages: true } },
    },
  });

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      topic: s.topic,
      status: s.status,
      summary: s.summary,
      externalId: s.externalId,
      turns: s.turns,
      tokensSaved: s.tokensSaved,
      memories: s._count.memories,
      ledgerPages: s._count.ledgerPages,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  });
}
