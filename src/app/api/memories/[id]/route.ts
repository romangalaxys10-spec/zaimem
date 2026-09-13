import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { queueSync } from "@/lib/zaimem/github";
import { embed, embedToJson, extractKeywords } from "@/lib/zaimem/vector";

export const dynamic = "force-dynamic";

/** PATCH /api/memories/[id] — edit content (re-embed) and/or toggle pin. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  const mem = await db.memory.findFirst({ where: { id, userId: user.id } });
  if (!mem) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.content === "string") {
    const content = body.content.trim().slice(0, 8000);
    if (!content) return NextResponse.json({ error: "content cannot be empty" }, { status: 400 });
    data.content = content;
    data.embedding = embedToJson(embed(content));
    data.keywords = extractKeywords(content).join(",");
  }
  if (typeof body.pinned === "boolean") data.pinned = body.pinned;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update — send content and/or pinned" }, { status: 400 });
  }

  const updated = await db.memory.update({
    where: { id },
    data,
    select: { id: true, kind: true, content: true, pinned: true, keywords: true, updatedAt: true },
  });
  queueSync(user.id); // cloud DB mirror (debounced)
  return NextResponse.json({ ok: true, memory: updated });
}

/** DELETE /api/memories/[id] — delete one memory (right-to-forget). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  const mem = await db.memory.findFirst({ where: { id, userId: user.id } });
  if (!mem) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await db.memory.delete({ where: { id } });
  queueSync(user.id); // cloud DB mirror (debounced)
  return NextResponse.json({ ok: true });
}
