import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { buildProjectInvitePrompt, baseUrlFromHeaders } from "@/lib/zaimem/prompts";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/prompt?agent=<name>
 * Paste-ready invite prompt that connects a fresh agent to this project team:
 * brief, shared files, roster, join sequence (zaimem_project_brief) and the
 * latest shared memories.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  const project = await db.project.findFirst({
    where: { id, userId: user.id },
    select: { id: true, userId: true, name: true, description: true, instructions: true },
  });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const agent = req.nextUrl.searchParams.get("agent")?.trim().slice(0, 60) || undefined;
  const prompt = await buildProjectInvitePrompt(
    { baseUrl: baseUrlFromHeaders(req), token: extractToken(req) ?? "" },
    project,
    agent,
  );
  return NextResponse.json({ prompt });
}
