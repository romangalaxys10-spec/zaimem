import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/settings — account settings (headroom mode, …). */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  return NextResponse.json({ headroom: !!user.headroom });
}

/** PATCH /api/settings — toggle settings: {headroom?: boolean}. */
export async function PATCH(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({} as { headroom?: boolean }));
  if (typeof body.headroom !== "boolean") {
    return NextResponse.json({ error: "bad_request", message: "nothing to update — pass headroom: true|false" }, { status: 400 });
  }
  const updated = await db.user.update({ where: { id: user.id }, data: { headroom: body.headroom } });
  return NextResponse.json({ headroom: !!updated.headroom });
}
