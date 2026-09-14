import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { queueSync } from "@/lib/zaimem/github";

export const dynamic = "force-dynamic";

const MAX_FILE_CHARS = 200_000; // ~50k tokens per file

/** POST /api/projects/[id]/files — attach (or replace) a text file: {name, content}. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const project = await db.project.findFirst({ where: { id, userId: user.id } });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({} as { name?: string; content?: string }));
  const name = String(body.name ?? "").trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 160);
  const content = String(body.content ?? "");
  if (!name) return NextResponse.json({ error: "bad_request", message: "name is required (with extension, e.g. spec.md)" }, { status: 400 });
  if (!content.trim()) return NextResponse.json({ error: "bad_request", message: "content is required" }, { status: 400 });
  if (content.length > MAX_FILE_CHARS) return NextResponse.json({ error: "bad_request", message: `file too large (max ${MAX_FILE_CHARS.toLocaleString()} chars)` }, { status: 413 });

  const file = await db.projectFile.upsert({
    where: { projectId_name: { projectId: project.id, name } },
    update: { content, size: content.length, updatedAt: new Date() },
    create: { projectId: project.id, name, content, size: content.length },
  });
  queueSync(user.id);
  return NextResponse.json({ file: { id: file.id, name: file.name, size: file.size, updatedAt: file.updatedAt }, replaced: file.createdAt !== file.updatedAt }, { status: 201 });
}

/** DELETE /api/projects/[id]/files?fileId=… — remove an attached file. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const project = await db.project.findFirst({ where: { id, userId: user.id } });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const fileId = req.nextUrl.searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "bad_request", message: "fileId query param required" }, { status: 400 });
  const file = await db.projectFile.findFirst({ where: { id: fileId, projectId: project.id } });
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await db.projectFile.delete({ where: { id: file.id } });
  queueSync(user.id);
  return NextResponse.json({ ok: true });
}
