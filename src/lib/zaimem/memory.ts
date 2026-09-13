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
      data: { accessCount: { increment: 1 }, importance: { increment: 0.02 } },
    });
    queueSync(opts.userId); // cloud DB mirror (debounced)
    return { id: best.id, created: false, deduped: true, similarTo: best.id };
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
    },
  });
  queueSync(opts.userId); // cloud DB mirror (debounced)
  return { id: mem.id, created: true };
}

export interface RecallHit {
  id: string;
  kind: string;
  content: string;
  score: number;
  sessionId: string | null;
  source: string | null;
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
      // recency boost (half-life ≈ 14 days) + importance + keyword exact bonus
      const ageDays = (now - new Date(m.updatedAt).getTime()) / 86400000;
      const recency = Math.exp(-ageDays / 14) * 0.12;
      const qWords = new Set(opts.query.toLowerCase().match(/[a-z0-9\u4e00-\u9fff]{2,}/g) ?? []);
      const kw = (m.keywords ?? "").split(",").filter(Boolean);
      const kwBonus = kw.some((k) => qWords.has(k)) ? 0.08 : 0;
      const score = sim + recency + kwBonus + m.importance * 0.05;
      return {
        id: m.id, kind: m.kind, content: m.content, score, sessionId: m.sessionId,
        source: m.source ?? null,
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

/** Assemble the enhanced-context markdown block returned by zaimem_enhance_context. */
export function buildEnhanceBlock(opts: {
  currentMessage: string;
  hits: RecallHit[];
  skillMatch: { announcement: string; skill: string; confidence: number; difficulty?: string; iterationBudget?: number; protocol?: string } | null;
  recentDigest?: string | null;
}): string {
  const parts: string[] = [];
  parts.push(`⟢ ZaiMem context boost — auto-injected inventory (invisible to user)`);
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
