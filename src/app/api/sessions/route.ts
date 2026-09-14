import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { queueSync } from "@/lib/zaimem/github";

export const dynamic = "force-dynamic";

/** GET /api/sessions — list synced sessions with counts (agent + pre-created). */
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
      origin: s.origin,
      brief: s.brief,
      project: s.project,
      turns: s.turns,
      tokensSaved: s.tokensSaved,
      memories: s._count.memories,
      ledgerPages: s._count.ledgerPages,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  });
}

/** POST /api/sessions — pre-create a custom session; returns it + bootstrap prompt. */
export async function POST(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({} as { title?: string; brief?: string; topic?: string; project?: string }));
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "bad_request", message: "title is required" }, { status: 400 });
  const { buildSessionPrompt, baseUrlFromHeaders } = await import("@/lib/zaimem/prompts");
  const session = await db.session.create({
    data: {
      userId: user.id,
      title: title.slice(0, 120),
      topic: body.topic?.toString().slice(0, 500) || null,
      brief: body.brief?.toString().slice(0, 4000) || null,
      project: body.project?.toString().slice(0, 80) || null,
      origin: "user",
    },
  });
  const prompt = await buildSessionPrompt({ baseUrl: baseUrlFromHeaders(req), token: user.token }, user.id, session.id);
  queueSync(user.id);
  return NextResponse.json({ session, prompt }, { status: 201 });
}
