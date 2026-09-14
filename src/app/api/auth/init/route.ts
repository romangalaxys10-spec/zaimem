import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/zaimem/auth";
import { seedBuiltinSkills } from "@/lib/zaimem/seed";
import { rateLimit, clientIp } from "@/lib/zaimem/ratelimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/init — fully automated private-token issuance.
 * No email, no password: a fresh visitor gets a private ZaiMem token instantly.
 *
 * Security (v1.7.2 audit): per-IP rate limit; tokens stored hashed (SHA-256)
 * — the plaintext lives only in this response body.
 */
export async function POST(_req: NextRequest) {
  if (!rateLimit(`init:${clientIp(_req)}`, 60, 5 * 60_000)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many tokens issued from this address. Try again later." },
      { status: 429 },
    );
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateToken();
    const exists = await db.user.findUnique({ where: { tokenHash: hashToken(token) } });
    if (exists) continue;
    const user = await db.user.create({ data: { tokenHash: hashToken(token), label: "auto" } });
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
