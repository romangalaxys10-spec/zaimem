import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { queueSync } from "@/lib/zaimem/github";

export const dynamic = "force-dynamic";

async function getProject(userId: string, id: string) {
  return db.project.findFirst({ where: { id, userId } });
}

/** GET /api/projects/[id] — full detail: files, agent roster, shared memories, sessions. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const project = await getProject(user.id, id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [files, agents, memories, sessions] = await Promise.all([
    db.projectFile.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } }),
    db.projectAgent.findMany({ where: { projectId: project.id }, orderBy: { lastSeenAt: "desc" } }),
    db.memory.findMany({
      where: { userId: user.id, project: project.name, archived: false, supersededBy: null, quarantined: false },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, kind: true, content: true, pinned: true, createdAt: true },
    }),
    db.session.findMany({
      where: { userId: user.id, project: project.name },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, title: true, turns: true, status: true, updatedAt: true },
    }),
  ]);

  return NextResponse.json({ project: { ...project, files, agents, memories, sessions } });
}

/** PATCH /api/projects/[id] — edit description / instructions. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const project = await getProject(user.id, id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = await req.json().catch(() => ({} as { description?: string; instructions?: string }));
  const updated = await db.project.update({
    where: { id: project.id },
    data: {
      ...(typeof body.description === "string" ? { description: body.description.slice(0, 1000) || null } : {}),
      ...(typeof body.instructions === "string" ? { instructions: body.instructions.slice(0, 8000) || null } : {}),
    },
  });
  queueSync(user.id);
  return NextResponse.json({ project: updated });
}

/** DELETE /api/projects/[id] — delete the project workspace (memories keep their tags, files/agents cascade). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const project = await getProject(user.id, id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await db.project.delete({ where: { id: project.id } });
  queueSync(user.id);
  return NextResponse.json({ ok: true });
}
