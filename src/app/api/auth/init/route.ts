import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/zaimem/auth";
import { seedBuiltinSkills } from "@/lib/zaimem/seed";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/init — fully automated private-token issuance.
 * No email, no password: a fresh visitor gets a private ZaiMem token instantly.
 */
export async function POST(_req: NextRequest) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateToken();
    const exists = await db.user.findUnique({ where: { token } });
    if (exists) continue;
    const user = await db.user.create({ data: { token, label: "auto" } });
    await seedBuiltinSkills(user.id);
    return NextResponse.json({
      token,
      userId: user.id,
      createdAt: user.createdAt,
      message: "Private ZaiMem token issued. Store it safely — it is your account key.",
    });
  }
  return NextResponse.json({ error: "token_generation_failed" }, { status: 500 });
}
