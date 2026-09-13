import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seedBuiltinSkills } from "@/lib/zaimem/seed";

export const dynamic = "force-dynamic";

/** POST /api/auth/login — verify an existing ZaiMem token. */
export async function POST(req: NextRequest) {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const token = body.token?.trim();
  if (!token) return NextResponse.json({ error: "token_required" }, { status: 400 });

  const user = await db.user.findUnique({ where: { token } });
  if (!user) {
    return NextResponse.json(
      { error: "invalid_token", message: "This token does not exist. Generate a new one on the landing page." },
      { status: 401 },
    );
  }
  await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  await seedBuiltinSkills(user.id);

  const [sessions, memories] = await Promise.all([
    db.session.count({ where: { userId: user.id } }),
    db.memory.count({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({ userId: user.id, sessions, memories, createdAt: user.createdAt });
}
