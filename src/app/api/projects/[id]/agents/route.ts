import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { queueSync } from "@/lib/zaimem/github";

export const dynamic = "force-dynamic";

/** POST /api/projects/[id]/agents — manually add an agent to the roster: {name, role?}. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const project = await db.project.findFirst({ where: { id, userId: user.id } });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({} as { name?: string; role?: string }));
  const name = String(body.name ?? "").trim().replace(/[^a-zA-Z0-9_\- .]/g, "").slice(0, 40);
  if (!name) return NextResponse.json({ error: "bad_request", message: "name is required (agent identity, e.g. 'frontend-dev')" }, { status: 400 });
  const role = body.role?.toString().slice(0, 60) || null;

  const agent = await db.projectAgent.upsert({
    where: { projectId_name: { projectId: project.id, name } },
    update: { ...(role ? { role } : {}) },
    create: { projectId: project.id, name, role, joinedVia: "manual" },
  });
  queueSync(user.id);
  return NextResponse.json({ agent }, { status: 201 });
}

/** DELETE /api/projects/[id]/agents?agentId=… — remove an agent from the roster. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const project = await db.project.findFirst({ where: { id, userId: user.id } });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const agentId = req.nextUrl.searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "bad_request", message: "agentId query param required" }, { status: 400 });
  const agent = await db.projectAgent.findFirst({ where: { id: agentId, projectId: project.id } });
  if (!agent) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await db.projectAgent.delete({ where: { id: agent.id } });
  queueSync(user.id);
  return NextResponse.json({ ok: true });
}
