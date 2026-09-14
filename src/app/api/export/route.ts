import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized, maskToken } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/export
 * Full-account JSON export — memories, sessions, ledger pages, skills,
 * tool-pack prefs and project teams (with files & agents) in one portable,
 * human-readable archive. Excludes internal vectors and credentials.
 */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const [memories, sessions, ledgerPages, skills, toolPacks, projects] = await Promise.all([
    db.memory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        kind: true, content: true, keywords: true, importance: true,
        pinned: true, accessCount: true, source: true, project: true,
        quarantined: true, archived: true, createdAt: true, updatedAt: true,
      },
    }),
    db.session.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        externalId: true, title: true, topic: true, origin: true, brief: true,
        project: true, status: true, summary: true, metadata: true,
        turns: true, tokensSaved: true, createdAt: true, updatedAt: true,
      },
    }),
    db.ledgerPage.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "asc" },
      select: { path: true, content: true, budget: true, updatedAt: true },
    }),
    db.skill.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { name: true, description: true, triggers: true, body: true, source: true, enabled: true },
    }),
    db.toolPackPref.findMany({
      where: { userId: user.id },
      select: { packId: true, enabled: true, updatedAt: true },
    }),
    db.project.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "asc" },
      select: {
        name: true, description: true, instructions: true, createdAt: true, updatedAt: true,
        files: { select: { name: true, content: true, size: true, updatedAt: true } },
        agents: { select: { name: true, role: true, joinedVia: true, lastSeenAt: true } },
      },
    }),
  ]);

  const payload = {
    format: "zaimem-account",
    version: 1,
    account: maskToken(extractToken(req) ?? ""),
    exportedAt: new Date().toISOString(),
    counts: {
      memories: memories.length,
      sessions: sessions.length,
      ledgerPages: ledgerPages.length,
      skills: skills.length,
      projects: projects.length,
    },
    memories,
    sessions,
    ledgerPages,
    skills,
    toolPacks,
    projects,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="zaimem-account-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
