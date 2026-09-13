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
