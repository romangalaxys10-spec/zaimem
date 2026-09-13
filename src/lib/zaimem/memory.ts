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

export interface RememberResult {
  id: string;
  created: boolean;
  pinned?: boolean;
  deduped?: boolean;
  merged?: boolean;
  similarTo?: string;
}

export async function rememberMemory(opts: {
  userId: string;
  content: string;
  kind?: string;
  importance?: number;
  sessionId?: string | null;
  pinned?: boolean;
}): Promise<RememberResult> {
  const content = opts.content.trim().slice(0, 8000);
  if (!content) throw new Error("content is required");
  const kind = isMemoryKind(opts.kind ?? "") ? (opts.kind as MemoryKind) : "fact";
  const importance = Math.min(1, Math.max(0, opts.importance ?? 0.5));

  // find candidate memories of same kind for dedupe (cheap pre-filter by kind, then vector compare)
  const candidates = await db.memory.findMany({
    where: { userId: opts.userId, kind },
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
    },
  });
  queueSync(opts.userId); // cloud DB mirror (debounced)
  return { id: mem.id, created: true, pinned: !!opts.pinned };
}

export interface RecallHit {
  id: string;
  kind: string;
  content: string;
  score: number;
  sessionId: string | null;
  source: string | null;
  pinned: boolean;
  createdAt: Date;
  accessCount: number;
}

export async function recallMemories(opts: {
  userId: string;
  query: string;
  limit?: number;
  kinds?: string[];
  sessionId?: string | null;
  crossSession?: boolean; // default true — memories from all sessions
}): Promise<RecallHit[]> {
  const limit = Math.min(25, Math.max(1, opts.limit ?? 6));
  const where: Record<string, unknown> = { userId: opts.userId };
  if (opts.kinds?.length) where.kind = { in: opts.kinds };
  if (!opts.crossSession && opts.sessionId) where.sessionId = opts.sessionId;

  const pool = await db.memory.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 600,
  });
  if (pool.length === 0) return [];

  const qvec = embed(opts.query);
  const now = Date.now();
  const hits = pool
    .map((m) => {
      let sim = 0;
      try { sim = cosineSimilarity(qvec, embedFromJson(m.embedding)); } catch { /* skip */ }
      // recency boost (half-life ≈ 14 days) + importance + keyword exact bonus + pin boost
      const ageDays = (now - new Date(m.updatedAt).getTime()) / 86400000;
      const recency = Math.exp(-ageDays / 14) * 0.12;
      const qWords = new Set(opts.query.toLowerCase().match(/[a-z0-9\u4e00-\u9fff]{2,}/g) ?? []);
      const kw = (m.keywords ?? "").split(",").filter(Boolean);
      const kwBonus = kw.some((k) => qWords.has(k)) ? 0.08 : 0;
      const pinBoost = m.pinned ? 0.15 : 0;
      const score = sim + recency + kwBonus + m.importance * 0.05 + pinBoost;
      return {
        id: m.id, kind: m.kind, content: m.content, score, sessionId: m.sessionId,
        source: m.source ?? null,
        pinned: m.pinned,
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
export async function getPinnedMemories(userId: string, take = 8) {
  return db.memory.findMany({
    where: { userId, pinned: true },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true, kind: true, content: true },
  });
}

/** Assemble the enhanced-context markdown block returned by zaimem_enhance_context. */
export function buildEnhanceBlock(opts: {
  currentMessage: string;
  hits: RecallHit[];
  pinned?: { id: string; kind: string; content: string }[];
  skillMatch: { announcement: string; skill: string; confidence: number; difficulty?: string; iterationBudget?: number; protocol?: string } | null;
  recentDigest?: string | null;
}): string {
  const parts: string[] = [];
  parts.push(`⟢ ZaiMem context boost — auto-injected inventory (invisible to user)`);
  if (opts.pinned?.length) {
    parts.push(`\n【Pinned — always in force】`);
    for (const p of opts.pinned) {
      parts.push(`📌 [${p.kind}] ${p.content.replace(/\s+/g, " ").slice(0, 260)}${p.content.length > 260 ? "…" : ""}`);
    }
  }
  if (opts.hits.length) {
    parts.push(`\n【Relevant long-term memory — top ${opts.hits.length}】`);
    for (const h of opts.hits) {
      parts.push(`• [${h.kind}] ${h.content.replace(/\s+/g, " ").slice(0, 320)}${h.content.length > 320 ? "…" : ""}`);
    }
  } else {
    parts.push(`\n【Relevant long-term memory】none above threshold — treat this as a fresh topic.`);
  }
  if (opts.recentDigest) {
    parts.push(`\n【Session digest so far】\n${opts.recentDigest.slice(0, 1200)}`);
  }
  if (opts.skillMatch) {
    parts.push(`\n【Skill activation】${opts.skillMatch.announcement}`);
    if (opts.skillMatch.protocol) {
      parts.push(`Protocol (follow for this task):\n${opts.skillMatch.protocol.slice(0, 2200)}`);
    }
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
  createdBefore?: string | null; // ISO date — only consider memories created before
  confirm?: boolean;
}): Promise<ForgetResult> {
  const where: Record<string, unknown> = { userId: opts.userId };
  if (opts.memoryId) where.id = opts.memoryId;
  if (opts.kind && isMemoryKind(opts.kind)) where.kind = opts.kind;
  if (opts.source) where.source = opts.source;
  if (opts.sessionId) where.sessionId = opts.sessionId;
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
    let qvec: number[] | null = null;
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
