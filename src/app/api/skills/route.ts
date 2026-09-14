import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { queueSync } from "@/lib/zaimem/github";
import { seedBuiltinSkills } from "@/lib/zaimem/seed";
import { TOOL_PACKS } from "@/lib/zaimem/tool-packs";

export const dynamic = "force-dynamic";

/**
 * GET /api/skills — full Skills-section payload:
 *   skills  — SKILL.md registry (builtin + imported + user)
 *   packs   — MCP tool packs with per-user on/off state
 *   headroom— current headroom compression mode
 * Seeds new builtin skills idempotently so existing accounts pick them up.
 */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  await seedBuiltinSkills(user.id);

  const [skills, prefs] = await Promise.all([
    db.skill.findMany({ where: { userId: user.id }, orderBy: [{ source: "asc" }, { name: "asc" }] }),
    db.toolPackPref.findMany({ where: { userId: user.id } }),
  ]);
  const disabledMap = new Map(prefs.map((p) => [p.packId, p.enabled]));

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
    packs: TOOL_PACKS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      tools: p.tools,
      locked: !!p.locked,
      enabled: p.locked ? true : disabledMap.get(p.id) ?? true,
    })),
    headroom: !!user.headroom,
  });
}

/**
 * PATCH /api/skills — toggle a skill, a tool pack, or headroom mode:
 *   {id, enabled}      → SKILL.md skill
 *   {packId, enabled}  → MCP tool pack (locked packs rejected)
 *   {headroom, enabled}→ headroom compression mode
 */
export async function PATCH(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  let body: { id?: string; packId?: string; headroom?: boolean; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // ── headroom mode toggle ──
  if (body.headroom) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled is required" }, { status: 400 });
    }
    const updated = await db.user.update({ where: { id: user.id }, data: { headroom: body.enabled } });
    return NextResponse.json({ ok: true, headroom: !!updated.headroom });
  }

  // ── tool pack toggle ──
  if (body.packId) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled is required" }, { status: 400 });
    }
    const pack = TOOL_PACKS.find((p) => p.id === body.packId);
    if (!pack) return NextResponse.json({ error: "not_found", message: "Unknown tool pack." }, { status: 404 });
    if (pack.locked) {
      return NextResponse.json({ error: "locked", message: `"${pack.name}" is the core of ZaiMem and cannot be disabled.` }, { status: 409 });
    }
    const pref = await db.toolPackPref.upsert({
      where: { userId_packId: { userId: user.id, packId: pack.id } },
      update: { enabled: body.enabled },
      create: { userId: user.id, packId: pack.id, enabled: body.enabled },
    });
    return NextResponse.json({ ok: true, pack: { id: pack.id, name: pack.name, enabled: pref.enabled } });
  }

  // ── skill toggle ──
  if (!body.id || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "id (or packId/headroom) and enabled are required" }, { status: 400 });
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
