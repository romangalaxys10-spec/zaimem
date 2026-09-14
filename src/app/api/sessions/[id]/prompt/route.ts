import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { buildSessionPrompt, baseUrlFromHeaders } from "@/lib/zaimem/prompts";

export const dynamic = "force-dynamic";

/**
 * GET /api/sessions/[id]/prompt
 * Bootstrap prompt for ANY existing session (agent-created or user pre-created):
 * a paste-ready prompt that lets a fresh agent in another chat/IDE continue
 * this session — summary, key memories, open tasks and the session id baked in.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  const session = await db.session.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const prompt = await buildSessionPrompt(
    { baseUrl: baseUrlFromHeaders(req), token: extractToken(req) ?? "" },
    user.id,
    id,
  );
  return NextResponse.json({ prompt });
}
