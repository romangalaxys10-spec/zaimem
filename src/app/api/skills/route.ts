import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { queueSync } from "@/lib/zaimem/github";

export const dynamic = "force-dynamic";

/** GET /api/skills — list the SKILL.md registry. */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const skills = await db.skill.findMany({
    where: { userId: user.id },
    orderBy: [{ source: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      triggers: safeArray(s.triggers),
      source: s.source,
      enabled: s.enabled,
      bodyPreview: s.body.slice(0, 240),
      updatedAt: s.updatedAt,
    })),
  });
}

/** PATCH /api/skills — enable/disable a skill (body: {id, enabled}). */
export async function PATCH(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  let body: { id?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "id and enabled are required" }, { status: 400 });
  }
  const skill = await db.skill.findFirst({ where: { id: body.id, userId: user.id } });
  if (!skill) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await db.skill.update({ where: { id: skill.id }, data: { enabled: body.enabled } });
  queueSync(user.id); // cloud DB mirror (debounced)
  return NextResponse.json({ ok: true, skill: { id: updated.id, name: updated.name, enabled: updated.enabled } });
}

function safeArray(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
