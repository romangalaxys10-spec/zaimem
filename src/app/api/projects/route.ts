import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { queueSync } from "@/lib/zaimem/github";

export const dynamic = "force-dynamic";

/** GET /api/projects — list projects with file/agent/memory/session counts. */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const projects = await db.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      _count: { select: { files: true, agents: true } },
    },
  });

  const withCounts = await Promise.all(
    projects.map(async (p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      instructions: p.instructions,
      files: p._count.files,
      agents: p._count.agents,
      memories: await db.memory.count({ where: { userId: user.id, project: p.name, archived: false } }),
      sessions: await db.session.count({ where: { userId: user.id, project: p.name } }),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  );

  return NextResponse.json({ projects: withCounts });
}

/** POST /api/projects — create a project (name + description + instructions). */
export async function POST(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({} as { name?: string; description?: string; instructions?: string }));
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "bad_request", message: "name is required" }, { status: 400 });
  const existing = await db.project.findUnique({ where: { userId_name: { userId: user.id, name } } });
  if (existing) return NextResponse.json({ error: "conflict", message: `project '${name}' already exists` }, { status: 409 });
  const project = await db.project.create({
    data: {
      userId: user.id,
      name,
      description: body.description?.toString().slice(0, 1000) || null,
      instructions: body.instructions?.toString().slice(0, 8000) || null,
    },
  });
  queueSync(user.id);
  return NextResponse.json({ project }, { status: 201 });
}
