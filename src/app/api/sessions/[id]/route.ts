import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { queueSync } from "@/lib/zaimem/github";

export const dynamic = "force-dynamic";

/** GET /api/sessions/[id] — session detail incl. memories + ledger pages. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  const session = await db.session.findFirst({
    where: { id, userId: user.id },
    include: {
      memories: {
        orderBy: { updatedAt: "desc" },
        select: { id: true, kind: true, content: true, importance: true, accessCount: true, createdAt: true },
      },
      ledgerPages: { select: { id: true, path: true, content: true, updatedAt: true } },
    },
  });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ session });
}

/** PATCH /api/sessions/[id] — edit a (pre-created) session's title/brief/topic/project. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const session = await db.session.findFirst({ where: { id, userId: user.id } });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = await req.json().catch(() => ({} as { title?: string; brief?: string; topic?: string; project?: string }));
  const updated = await db.session.update({
    where: { id },
    data: {
      ...(typeof body.title === "string" && body.title.trim() ? { title: body.title.trim().slice(0, 120) } : {}),
      ...(typeof body.brief === "string" ? { brief: body.brief.slice(0, 4000) || null } : {}),
      ...(typeof body.topic === "string" ? { topic: body.topic.slice(0, 500) || null } : {}),
      ...(typeof body.project === "string" ? { project: body.project.slice(0, 80) || null } : {}),
    },
  });
  queueSync(user.id);
  return NextResponse.json({ session: updated });
}

/** DELETE /api/sessions/[id] — forget a session (cascades ledger, keeps memories). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  const session = await db.session.findFirst({ where: { id, userId: user.id } });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await db.session.delete({ where: { id } });
  queueSync(user.id); // cloud DB mirror (debounced)
  return NextResponse.json({ ok: true });
}
