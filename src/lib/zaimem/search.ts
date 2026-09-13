/**
 * ZaiMem Global Search
 * ─────────────────────────────────────────────────────────────────────────────
 * One query → everything the user owns, across ALL sessions:
 *   sessions  (title / topic / summary)
 *   memories  (vector recall + exact substring merge, cross-session)
 *   ledger    (smart-skill notes.md / tasks.json / workflows.md pages)
 *   skills    (SKILL.md registry entries)
 *
 * Designed for the dashboard command bar: fast (a handful of indexed
 * queries + bounded pools), non-destructive, and read-only.
 */

import { db } from "@/lib/db";
import { recallMemories, type RecallHit } from "./memory";

export interface SessionHit {
  id: string;
  title: string;
  topic: string | null;
  status: string;
  turns: number;
  memories: number;
  matchIn: "title" | "topic" | "summary";
  excerpt: string;
  updatedAt: string;
}

export interface MemoryHit extends RecallHit {
  sessionTitle: string | null;
}

export interface LedgerHit {
  id: string;
  path: string;
  sessionId: string | null;
  sessionTitle: string | null;
  excerpt: string;
  updatedAt: string;
}

export interface SkillHit {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  excerpt: string;
}

export interface GlobalSearchResults {
  q: string;
  sessions: SessionHit[];
  memories: MemoryHit[];
  ledger: LedgerHit[];
  skills: SkillHit[];
  total: number;
  tookMs: number;
}

const LIMITS = { sessions: 8, memories: 8, ledger: 8, skills: 6 };
const POOL = 600;

function terms(q: string): string[] {
  return (q.toLowerCase().match(/[a-z0-9\u4e00-\u9fff][a-z0-9\u4e00-\u9fff.'_-]*/g) ?? []).filter((t) => t.length >= 2);
}

function excerptAround(text: string, q: string, radius = 90): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const idx = clean.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return clean.slice(0, radius * 2) + (clean.length > radius * 2 ? "…" : "");
  const start = Math.max(0, idx - radius);
  const end = Math.min(clean.length, idx + q.length + radius);
  return (start > 0 ? "…" : "") + clean.slice(start, end) + (end < clean.length ? "…" : "");
}

/** does `hay` contain ALL query terms? returns match count. */
function matchCount(hay: string, ts: string[]): number {
  const l = hay.toLowerCase();
  return ts.reduce((n, t) => (l.includes(t) ? n + 1 : n), 0);
}

export async function globalSearch(userId: string, rawQuery: string): Promise<GlobalSearchResults> {
  const t0 = Date.now();
  const q = rawQuery.trim().slice(0, 200);
  const ts = terms(q);
  const empty: GlobalSearchResults = { q, sessions: [], memories: [], ledger: [], skills: [], total: 0, tookMs: 0 };
  if (!q || ts.length === 0) return empty;

  // phrase-first: also try the raw query for multi-word matches
  const phrase = q.toLowerCase();

  // ── sessions ──────────────────────────────────────────────────────────────
  const sessionRows = await db.session.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: POOL,
    select: { id: true, title: true, topic: true, summary: true, status: true, turns: true, updatedAt: true, _count: { select: { memories: true } } },
  });
  const sessions: SessionHit[] = sessionRows
    .map((s) => {
      const cTitle = matchCount(s.title, ts) + (s.title.toLowerCase().includes(phrase) ? 2 : 0);
      const cTopic = s.topic ? matchCount(s.topic, ts) : 0;
      const cSummary = s.summary ? matchCount(s.summary, ts) : 0;
      const best = Math.max(cTitle * 3, cTopic * 2, cSummary);
      if (best === 0) return null;
      const matchIn: SessionHit["matchIn"] = cTitle > 0 ? "title" : cTopic > 0 ? "topic" : "summary";
      const source = matchIn === "title" ? s.title : matchIn === "topic" ? (s.topic ?? "") : (s.summary ?? "");
      return {
        id: s.id, title: s.title, topic: s.topic, status: s.status, turns: s.turns,
        memories: s._count.memories, matchIn,
        excerpt: excerptAround(source || s.title, q),
        updatedAt: new Date(s.updatedAt).toISOString(),
      } as SessionHit;
    })
    .filter((x): x is SessionHit => !!x)
    .sort((a, b) => matchCount(b.title + (b.topic ?? "") + " ", ts) - matchCount(a.title + (a.topic ?? "") + " ", ts))
    .slice(0, LIMITS.sessions);

  // ── memories (vector + substring merge, cross-session) ───────────────────
  let memHits: RecallHit[] = [];
  try {
    memHits = await recallMemories({ userId, query: q, limit: LIMITS.memories });
  } catch { /* vector path optional — substring below still applies */ }

  const memPool = await db.memory.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: POOL,
    select: { id: true, kind: true, content: true, keywords: true, importance: true, accessCount: true, sessionId: true, createdAt: true, updatedAt: true },
  });
  const byId = new Map<string, RecallHit>(memHits.map((h) => [h.id, h]));
  for (const m of memPool) {
    if (byId.has(m.id)) continue;
    const c = matchCount(m.content, ts) + (m.content.toLowerCase().includes(phrase) ? 2 : 0);
    if (c === 0) continue;
    byId.set(m.id, {
      id: m.id, kind: m.kind, content: m.content, sessionId: m.sessionId,
      score: Math.min(0.99, 0.3 + c * 0.15 + m.importance * 0.1),
      createdAt: m.createdAt, accessCount: m.accessCount,
    });
  }
  // vector recall is fuzzy — drop hits whose score is too low to be a real
  // match (recency/importance boosts alone can clear the recall threshold)
  const topMems = [...byId.values()]
    .filter((h) => h.score >= 0.3 || matchCount(h.content, ts) > 0 || h.content.toLowerCase().includes(phrase))
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMITS.memories);

  const sessionTitles = new Map<string, string>(
    sessionRows.map((s) => [s.id, s.title] as const),
  );
  if (topMems.some((m) => m.sessionId && !sessionTitles.has(m.sessionId))) {
    const extra = await db.session.findMany({
      where: { id: { in: topMems.map((m) => m.sessionId).filter((x): x is string => !!x) } },
      select: { id: true, title: true },
    });
    for (const s of extra) sessionTitles.set(s.id, s.title);
  }
  const memories: MemoryHit[] = topMems.map((h) => ({
    ...h,
    sessionTitle: h.sessionId ? (sessionTitles.get(h.sessionId) ?? null) : null,
  }));

  // ── ledger pages ──────────────────────────────────────────────────────────
  const ledgerRows = await db.ledgerPage.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: POOL,
    select: { id: true, path: true, content: true, sessionId: true, updatedAt: true },
  });
  const ledger: LedgerHit[] = ledgerRows
    .map((p) => {
      const c = matchCount(p.content, ts) + (p.content.toLowerCase().includes(phrase) ? 2 : 0);
      if (c === 0) return null;
      return {
        id: p.id, path: p.path, sessionId: p.sessionId,
        sessionTitle: p.sessionId ? (sessionTitles.get(p.sessionId) ?? null) : null,
        excerpt: excerptAround(p.content, q), updatedAt: new Date(p.updatedAt).toISOString(),
      } as LedgerHit;
    })
    .filter((x): x is LedgerHit => !!x)
    .slice(0, LIMITS.ledger);

  // ── skills ────────────────────────────────────────────────────────────────
  const skillRows = await db.skill.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true, body: true, enabled: true },
  });
  const skills: SkillHit[] = skillRows
    .map((k) => {
      const c = matchCount(k.name + " " + k.description + " " + k.body, ts);
      if (c === 0) return null;
      return {
        id: k.id, name: k.name, description: k.description, enabled: k.enabled,
        excerpt: excerptAround(k.body || k.description, q),
      } as SkillHit;
    })
    .filter((x): x is SkillHit => !!x)
    .slice(0, LIMITS.skills);

  const results = { q, sessions, memories, ledger, skills, total: sessions.length + memories.length + ledger.length + skills.length, tookMs: Date.now() - t0 };
  return results;
}
