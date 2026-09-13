import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { queueSync } from "@/lib/zaimem/github";

export const dynamic = "force-dynamic";

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
