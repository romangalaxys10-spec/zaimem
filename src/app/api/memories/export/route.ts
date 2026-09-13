import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized, maskToken } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/memories/export
 * Download every memory as a portable, re-importable JSON file.
 */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const rows = await db.memory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      kind: true,
      content: true,
      keywords: true,
      importance: true,
      accessCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const payload = {
    format: "zaimem-memories",
    version: 1,
    account: maskToken(user.token),
    exportedAt: new Date().toISOString(),
    count: rows.length,
    memories: rows,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="zaimem-memories-${date}.json"`,
    },
  });
}
