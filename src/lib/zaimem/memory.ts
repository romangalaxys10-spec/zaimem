/**
 * ZaiMem Memory Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared operations used by both the MCP server tools and dashboard API routes:
 * remember (store + auto-dedupe), recall (vector search), enhance (context
 * assembly), stats recording.
 */

import { db } from "@/lib/db";
import { embed, embedFromJson, embedToJson, cosineSimilarity, extractKeywords } from "./vector";
import { queueSync } from "./github";

export type MemoryKind =
  | "fact"
  | "decision"
  | "preference"
  | "reflection"
  | "workflow"
  | "summary"
  | "document";

export const MEMORY_KINDS: MemoryKind[] = [
  "fact", "decision", "preference", "reflection", "workflow", "summary", "document",
];

export function isMemoryKind(k: string): k is MemoryKind {
  return MEMORY_KINDS.includes(k as MemoryKind);
}

const DEDUPE_THRESHOLD = 0.94; // near-duplicate similarity
const NEAR_THRESHOLD = 0.8;

// ─── injection-guard: quarantine scan ────────────────────────────────────────
// Content matching these patterns is STORED (data integrity) but never
// auto-injected into enhance_context — memory is data, not instructions.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)/i,
  /disregard\s+(all\s+)?(previous|prior|your)\s+(instructions|rules|prompt)/i,
  /you\s+are\s+now\s+(a|an|the)\b/i,
  /new\s+(system\s+)?prompt\s*[:=]/i,
  /system\s+prompt\s*[:=]/i,
  /(reveal|show|print|repeat)\s+(your|the)\s+(system\s+)?(prompt|instructions)/i,
  /exfiltrat(e|ion|ing)/i,
  /\b(persist|store)\s+this\s+(rule|instruction)\s+for\s+all\s+(future\s+)?sessions/i,
];

export function scanQuarantine(content: string): boolean {
  const head = content.slice(0, 2000);
  return INJECTION_PATTERNS.some((r) => r.test(head));
}

// ─── auto-importance heuristics ─────────────────────────────────
const IMPORTANCE_MARKERS: RegExp[] = [
  /\b(remember this|important|critical|must|always|never|rule|constraint|requirement)\b/i,
  /!/,
  /\b[A-Z]{3,}\b/,
  /\b(prefer|preference|whenever|do not|don't)\b/i,
];

function heuristicImportance(content: string): number {
  let bumps = 0;
  for (const r of IMPORTANCE_MARKERS) if (r.test(content)) bumps++;
  return Math.min(0.9, 0.5 + bumps * 0.08);
}

export interface RememberResult {
  id: string;
  created: boolean;
  pinned?: boolean;
  deduped?: boolean;
  merged?: boolean;
  superseded?: string | null; // id of the old memory replaced by this one
  quarantined?: boolean;
  similarTo?: string;
}

export async function rememberMemory(opts: {
  userId: string;
  content: string;
  kind?: string;
  importance?: number;
  sessionId?: string | null;
  pinned?: boolean;
  project?: string | null;
  supersedes?: string | null; // explicit conflict resolution: mark old memory superseded
}): Promise<RememberResult> {
  const content = opts.content.trim().slice(0, 8000);
  if (!content) throw new Error("content is required");
  const kind = isMemoryKind(opts.kind ?? "") ? (opts.kind as MemoryKind) : "fact";
  const importance = opts.importance !== undefined
    ? Math.min(1, Math.max(0, opts.importance))
    : heuristicImportance(content);
  const quarantined = scanQuarantine(content);
  const project = opts.project?.trim().slice(0, 80) || null;

  // find candidate memories of same kind for dedupe (cheap pre-filter by kind, then vector compare)
  const candidates = await db.memory.findMany({
    where: { userId: opts.userId, kind, archived: false, supersededBy: null, ...(project ? { project } : {}) },
    select: { id: true, content: true, embedding: true },
    take: 400,
    orderBy: { updatedAt: "desc" },
  });
  const vec = embed(content);
  let best: { id: string; sim: number } | null = null;
  for (const c of candidates) {
    try {
      const sim = cosineSimilarity(vec, embedFromJson(c.embedding));
      if (!best || sim > best.sim) best = { id: c.id, sim };
    } catch { /* skip corrupt vectors */ }
  }

  if (best && best.sim >= DEDUPE_THRESHOLD) {
    // exact-ish duplicate → bump importance + accessCount, refresh timestamp
    await db.memory.update({
      where: { id: best.id },
      data: {
        accessCount: { increment: 1 },
        importance: { increment: 0.02 },
        ...(opts.pinned ? { pinned: true } : {}), // re-remembering with pin upgrades the duplicate
      },
    });
    queueSync(opts.userId); // cloud DB mirror (debounced)
    return { id: best.id, created: false, pinned: !!opts.pinned, deduped: true, similarTo: best.id };
  }

  if (best && best.sim >= NEAR_THRESHOLD && importance <= 0.6) {
    // near-duplicate with low importance → merge by replacing content with the longer one
    const existing = await db.memory.findUnique({ where: { id: best.id } });
    if (existing && content.length > existing.content.length) {
      await db.memory.update({
        where: { id: best.id },
        data: { content, embedding: embedToJson(vec), keywords: extractKeywords(content).join(",") },
      });
      queueSync(opts.userId);
      return { id: best.id, created: false, merged: true, similarTo: best.id };
    }
    await db.memory.update({ where: { id: best.id }, data: { accessCount: { increment: 1 } } });
    return { id: best.id, created: false, merged: true, similarTo: best.id };
  }

  const mem = await db.memory.create({
    data: {
      userId: opts.userId,
      sessionId: opts.sessionId ?? null,
      kind,
      content,
      keywords: extractKeywords(content).join(","),
      embedding: embedToJson(vec),
      importance,
      pinned: !!opts.pinned,
      project,
      quarantined,
    },
  });

  // explicit conflict resolution: the new memory replaces an older one
  let supersededOld: string | null = null;
  if (opts.supersedes) {
    const old = await db.memory.findFirst({ where: { id: opts.supersedes, userId: opts.userId } });
    if (old) {
      await db.memory.update({ where: { id: old.id }, data: { supersededBy: mem.id } });
      supersededOld = old.id;
    }
  }

  queueSync(opts.userId); // cloud DB mirror (debounced)
  return { id: mem.id, created: true, pinned: !!opts.pinned, superseded: supersededOld, quarantined };
}

export interface ScoreBreakdown {
  sim: number;
  recency: number;
  keyword: number;
  importance: number;
  pin: number;
  bm25: number;
}

export interface RecallHit {
  id: string;
  kind: string;
  content: string;
  score: number;
  sessionId: string | null;
  source: string | null;
  pinned: boolean;
  details: ScoreBreakdown; // recall provenance — why this hit ranked here
  createdAt: Date;
  accessCount: number;
}

/** BM25 keyword scoring over the candidate pool (hybrid fusion partner for vectors). */
function bm25Scores(pool: { content: string; keywords: string | null }[], query: string): number[] {
  const k1 = 1.2, b = 0.75;
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9\u4e00-\u9fff]{2,}/g) ?? [])];
  if (!terms.length || pool.length === 0) return pool.map(() => 0);
  const docs = pool.map((m) => `${m.content} ${(m.keywords ?? "").replace(/,/g, " ")}`.toLowerCase());
  const docTerms = docs.map((d) => d.match(/[a-z0-9\u4e00-\u9fff]{2,}/g) ?? []);
  const N = docs.length;
  const avgdl = Math.max(1, docTerms.reduce((a, t) => a + t.length, 0) / N);
  const tfs = docTerms.map((tokens) => {
    const m = new Map<string, number>();
    for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  });
  const df = new Map<string, number>();
  for (const term of terms) {
    let n = 0;
    for (const m of tfs) if (m.has(term)) n++;
    df.set(term, n);
  }
  return tfs.map((m, i) => {
    const dl = Math.max(1, docTerms[i].length);
    let score = 0;
    for (const term of terms) {
      const f = m.get(term) ?? 0;
      if (!f) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log((N - n + 0.5) / (n + 0.5) + 1);
      score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / avgdl)));
    }
    return score;
  });
}

export async function recallMemories(opts: {
  userId: string;
  query: string;
  limit?: number;
  kinds?: string[];
  sessionId?: string | null;
  project?: string | null; // scope to a project namespace (pinned globals still apply to enhance)
  crossSession?: boolean; // default true — memories from all sessions
}): Promise<RecallHit[]> {
  const limit = Math.min(25, Math.max(1, opts.limit ?? 6));
  const where: Record<string, unknown> = {
    userId: opts.userId,
    archived: false, // decayed memories stay out of recall
    supersededBy: null, // conflict chains surface only the latest fact
  };
  if (opts.kinds?.length) where.kind = { in: opts.kinds };
  if (opts.project) where.project = opts.project;
  if (!opts.crossSession && opts.sessionId) where.sessionId = opts.sessionId;

  const pool = await db.memory.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 600,
  });
  if (pool.length === 0) return [];

  const qvec = embed(opts.query);
  const bm25 = bm25Scores(pool, opts.query);
  const maxBm25 = Math.max(...bm25, 0.0001);
  const now = Date.now();
  const qWords = new Set(opts.query.toLowerCase().match(/[a-z0-9\u4e00-\u9fff]{2,}/g) ?? []);

  const hits = pool
    .map((m, i) => {
      let sim = 0;
      try { sim = cosineSimilarity(qvec, embedFromJson(m.embedding)); } catch { /* skip */ }
      // recency boost (half-life ≈ 14 days) + importance + keyword exact bonus + pin boost
      const ageDays = (now - new Date(m.updatedAt).getTime()) / 86400000;
      const recency = Math.exp(-ageDays / 14) * 0.12;
      const kw = (m.keywords ?? "").split(",").filter(Boolean);
      const kwBonus = kw.some((k) => qWords.has(k)) ? 0.08 : 0;
      const pinBoost = m.pinned ? 0.15 : 0;
      const bm25Norm = bm25[i] / maxBm25;
      const details: ScoreBreakdown = {
        sim: Math.round(sim * 1000) / 1000,
        recency: Math.round(recency * 1000) / 1000,
        keyword: kwBonus,
        importance: Math.round(m.importance * 0.05 * 1000) / 1000,
        pin: pinBoost,
        bm25: Math.round(bm25Norm * 1000) / 1000,
      };
      // hybrid fusion: vectors carry semantics, BM25 rescues exact identifiers/codes/names
      const score = 0.78 * (sim + recency + kwBonus + m.importance * 0.05 + pinBoost) + 0.22 * bm25Norm;
      return {
        id: m.id, kind: m.kind, content: m.content, score, sessionId: m.sessionId,
        source: m.source ?? null,
        pinned: m.pinned,
        details,
        createdAt: m.createdAt, accessCount: m.accessCount,
      };
    })
    .filter((h) => h.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // fire-and-forget access count bump
  if (hits.length) {
    db.memory
      .updateMany({ where: { id: { in: hits.map((h) => h.id) } }, data: { accessCount: { increment: 1 } } })
      .catch(() => {});
  }
  return hits;
}

/** Fetch pinned memories for enhance_context injection (most recently updated first). */
export async function getPinnedMemories(userId: string, project?: string | null, take = 8) {
  return db.memory.findMany({
    where: {
      userId,
      pinned: true,
      archived: false,
      quarantined: false,
      supersededBy: null,
      ...(project ? { OR: [{ project }, { project: null }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true, kind: true, content: true, source: true, project: true },
  });
}

/** Assemble the enhanced-context markdown block returned by zaimem_enhance_context.
 *  headroom=true (user-level toggle, headroomlabs-ai/headroom pattern) compresses
 *  the injection HARDER: shorter excerpts, fewer protocol lines, digest capped —
 *  originals stay full-fidelity in the store (retrieve via doc_read / recall). */
export function buildEnhanceBlock(opts: {
  currentMessage: string;
  hits: RecallHit[];
  pinned?: { id: string; kind: string; content: string; source?: string | null }[];
  skillMatch: { announcement: string; skill: string; confidence: number; difficulty?: string; iterationBudget?: number; protocol?: string } | null;
  recentDigest?: string | null;
  headroom?: boolean;
}): string {
  const headroom = !!opts.headroom;
  const PIN_CAP = headroom ? 150 : 260;
  const HIT_CAP = headroom ? 170 : 320;
  const DIGEST_CAP = headroom ? 600 : 1200;
  const parts: string[] = [];
  parts.push(`⟢ ZaiMem context boost — auto-injected inventory (invisible to user)${headroom ? " · HEADROOM compression ON" : ""}`);
  if (opts.pinned?.length) {
    parts.push(`\n【Pinned — always in force】`);
    for (const p of opts.pinned) {
      const tag = p.source ? ` [doc:${p.source}]` : "";
      parts.push(`📌 [${p.kind}]${tag} ${p.content.replace(/\s+/g, " ").slice(0, PIN_CAP)}${p.content.length > PIN_CAP ? "…" : ""}`);
    }
  }
  if (opts.hits.length) {
    parts.push(`\n【Relevant long-term memory — top ${opts.hits.length}】`);
    for (const h of opts.hits) {
      const tag = h.source ? ` [doc:${h.source}]` : "";
      parts.push(`• [${h.kind}]${tag} ${h.content.replace(/\s+/g, " ").slice(0, HIT_CAP)}${h.content.length > HIT_CAP ? "…" : ""}`);
    }
  } else {
    parts.push(`\n【Relevant long-term memory】none above threshold — treat this as a fresh topic.`);
  }
  if (opts.recentDigest) {
    parts.push(`\n【Session digest so far】\n${opts.recentDigest.slice(0, DIGEST_CAP)}`);
  }
  if (opts.skillMatch) {
    parts.push(`\n【Skill activation】${opts.skillMatch.announcement}`);
    if (opts.skillMatch.protocol && !headroom) {
      parts.push(`Protocol (follow for this task):\n${opts.skillMatch.protocol.slice(0, 2200)}`);
    } else if (opts.skillMatch.protocol && headroom) {
      parts.push(`(full skill protocol withheld by HEADROOM — fetch with zaimem_get_skill {name: "${opts.skillMatch.skill}"} only if needed)`);
    }
  }
  if (headroom) {
    parts.push(`\nHEADROOM mode: excerpts are compressed to preserve context-window headroom. Full originals remain in the store — pull exact text with zaimem_doc_read {source, part} or zaimem_recall when precision matters.`);
  }
  parts.push(`\nUse silently. If memories conflict with the user's latest message, the user wins. Store any NEW durable fact with zaimem_remember.`);
  return parts.join("\n");
}

export async function recordStat(opts: {
  userId: string;
  action: string;
  tokensIn?: number;
  tokensOut?: number;
  tokensSaved?: number;
  detail?: unknown;
}) {
  try {
    await db.usageStat.create({
      data: {
        userId: opts.userId,
        action: opts.action,
        tokensIn: opts.tokensIn ?? 0,
        tokensOut: opts.tokensOut ?? 0,
        tokensSaved: opts.tokensSaved ?? 0,
        detail: opts.detail ? JSON.stringify(opts.detail).slice(0, 2000) : null,
      },
    });
  } catch { /* stats are best-effort */ }
}

// ─── Forget (right to be forgotten) ──────────────────────────────────────────

export interface ForgetMatch {
  id: string;
  kind: string;
  content: string;
  source: string | null;
  pinned: boolean;
  createdAt: Date;
}

export interface ForgetResult {
  matches: ForgetMatch[];
  deleted: number;
  preview: boolean;
}

/**
 * Find (and optionally delete) memories matching a selector. Match criteria are
 * combined with AND; within a query match, either semantic similarity or a
 * case-insensitive substring hit qualifies. Two-phase by design: preview first
 * (confirm=false), delete only with confirm=true.
 */
export async function forgetMemories(opts: {
  userId: string;
  memoryId?: string | null;
  query?: string | null;
  kind?: string | null;
  source?: string | null;
  sessionId?: string | null;
  project?: string | null;
  createdBefore?: string | null; // ISO date — only consider memories created before
  confirm?: boolean;
}): Promise<ForgetResult> {
  const where: Record<string, unknown> = { userId: opts.userId };
  if (opts.memoryId) where.id = opts.memoryId;
  if (opts.kind && isMemoryKind(opts.kind)) where.kind = opts.kind;
  if (opts.source) where.source = opts.source;
  if (opts.sessionId) where.sessionId = opts.sessionId;
  if (opts.project) where.project = opts.project;
  if (opts.createdBefore) {
    const d = new Date(opts.createdBefore);
    if (!Number.isNaN(d.getTime())) where.createdAt = { lt: d };
  }

  const pool = await db.memory.findMany({
    where,
    select: { id: true, kind: true, content: true, source: true, pinned: true, embedding: true, createdAt: true },
    take: 600,
    orderBy: { createdAt: "desc" },
  });

  let matches: ForgetMatch[];
  const query = opts.query?.trim();
  if (query) {
    const qLower = query.toLowerCase();
    let qvec: Float64Array | null = null;
    try { qvec = embed(query); } catch { qvec = null; }
    matches = pool
      .filter((m) => {
        if (m.content.toLowerCase().includes(qLower)) return true;
        if (qvec) {
          try {
            return cosineSimilarity(qvec, embedFromJson(m.embedding)) >= 0.45;
          } catch { return false; }
        }
        return false;
      })
      .map((m) => ({
        id: m.id, kind: m.kind, content: m.content,
        source: m.source ?? null, pinned: m.pinned, createdAt: m.createdAt,
      }));
  } else {
    matches = pool.map((m) => ({
      id: m.id, kind: m.kind, content: m.content,
      source: m.source ?? null, pinned: m.pinned, createdAt: m.createdAt,
    }));
  }

  if (!opts.confirm) return { matches, deleted: 0, preview: true };

  if (matches.length) {
    await db.memory.deleteMany({ where: { id: { in: matches.map((m) => m.id) }, userId: opts.userId } });
    queueSync(opts.userId); // cloud DB mirror (debounced)
    await recordStat({ userId: opts.userId, action: "forget", detail: { deleted: matches.length } });
  }
  return { matches, deleted: matches.length, preview: false };
}

// ─── Decay & archive ─────────────────────────────────────────────────────

export interface DecayCandidate {
  id: string;
  kind: string;
  content: string;
  accessCount: number;
  importance: number;
  score: number; // 0..1 — lower = stronger decay candidate
  ageDays: number;
  createdAt: Date;
}

/** Memories that no longer earn their place: low importance, never/fewly accessed, stale. */
export async function decayCandidates(userId: string, limit = 25): Promise<DecayCandidate[]> {
  const pool = await db.memory.findMany({
    where: { userId, archived: false, pinned: false, supersededBy: null },
    select: { id: true, kind: true, content: true, accessCount: true, importance: true, updatedAt: true, createdAt: true },
    take: 600,
    orderBy: { updatedAt: "asc" },
  });
  const now = Date.now();
  return pool
    .map((m) => {
      const ageDays = (now - new Date(m.updatedAt).getTime()) / 86400000;
      const recency = Math.exp(-ageDays / 14); // 1 fresh → 0 stale
      const access = Math.min(1, m.accessCount / 5);
      const score = Math.round((m.importance * 0.45 + recency * 0.35 + access * 0.2) * 1000) / 1000;
      return {
        id: m.id, kind: m.kind, content: m.content,
        accessCount: m.accessCount, importance: m.importance,
        score, ageDays: Math.round(ageDays), createdAt: m.createdAt,
      };
    })
    .filter((m) => m.score < 0.35)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

// ─── Briefs: "what's new" + resume ─────────────────────────────────────

export async function buildWhatsNewBrief(userId: string, sinceMs: number, project?: string | null) {
  const since = new Date(sinceMs);
  const projectWhere = project ? { project } : {};
  const [newMemories, sessions, docs] = await Promise.all([
    db.memory.findMany({
      where: { userId, createdAt: { gte: since }, archived: false, quarantined: false, ...projectWhere },
      orderBy: { importance: "desc" },
      take: 6,
      select: { id: true, kind: true, content: true, source: true, createdAt: true },
    }),
    db.session.findMany({
      where: { userId, updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, title: true, project: true, turns: true, tokensSaved: true, summary: true },
    }),
    db.memory.count({ where: { userId, kind: "document", createdAt: { gte: since }, ...projectWhere } }),
  ]);
  const [memCount] = await Promise.all([
    db.memory.count({ where: { userId, createdAt: { gte: since }, archived: false, ...projectWhere } }),
  ]);
  return { since, newMemories, sessions, docsIngested: docs, memoriesAdded: memCount };
}

export async function buildResumeBrief(userId: string, sessionId: string) {
  const session = await db.session.findFirst({ where: { id: sessionId, userId } });
  if (!session) return null;
  const [recentMemories, taskPage] = await Promise.all([
    db.memory.findMany({
      where: { userId, sessionId, archived: false, supersededBy: null },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, kind: true, content: true, createdAt: true },
    }),
    db.ledgerPage.findFirst({
      where: { userId, sessionId: null, path: "tasks.json" },
      select: { content: true, updatedAt: true },
    }),
  ]);
  // checkpoint diff: memories added since the last session-level event (summary write / activity)
  const sinceRef = session.summary ? session.updatedAt : new Date(session.createdAt);
  const addedSince = await db.memory.count({
    where: { userId, sessionId, createdAt: { gt: sinceRef } },
  });
  let openTasks: string[] = [];
  if (taskPage) {
    try {
      const parsed = JSON.parse(taskPage.content);
      if (Array.isArray(parsed)) {
        openTasks = parsed
          .filter((t: Record<string, unknown>) => !(t.done === true || t.status === "done" || t.status === "completed"))
          .map((t: Record<string, unknown>) => String(t.task ?? t.title ?? t.name ?? JSON.stringify(t)).slice(0, 140))
          .slice(0, 12);
      }
    } catch { /* malformed ledger — skip */ }
  }
  return { session, recentMemories, openTasks, addedSince };
}
