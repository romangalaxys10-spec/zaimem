/**
 * ZaiMem Meeting Intelligence (v1.7) — the Tactiq pattern, self-hosted:
 * paste a meeting transcript (Google Meet / Zoom / Teams export, or raw text)
 * → full transcript becomes chunked vector memory (source `meeting:<title>`),
 * an LLM digest becomes the summary memory, and action items are extracted and
 * pushed onto the global tasks.json board. Searchable via recall/meeting tools.
 */

import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { embed, embedFromJson, cosineSimilarity } from "./vector";
import { ingestDocument } from "./ingest";
import { queueSync } from "./github";
import { recordStat } from "./memory";
import { findGlobalLedgerPage, upsertGlobalLedgerPage } from "./mcp-helpers";

export const MEETING_SOURCE_PREFIX = "meeting:";

export function meetingSource(title: string): string {
  return `${MEETING_SOURCE_PREFIX}${title.replace(/\s+/g, " ").trim().slice(0, 120)}`;
}

export interface MeetingIngestResult {
  source: string;
  status: "ingested" | "unchanged" | "replaced";
  chunks: number;
  tokensEst: number;
  summary: string;
  summaryMethod: "llm" | "extractive";
  actionItems: { who: string; what: string; due?: string }[];
  summaryMemoryId: string;
}

function extractiveSummary(transcript: string, title: string): string {
  // deterministic fallback: longest informative lines (heuristic "who said what")
  const lines = transcript.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 60);
  const ranked = lines
    .map((l) => ({ l, score: Math.min(l.length, 400) / 4 + (/(decid|agree|will|next|action|deadline|blocker|launch|ship)/i.test(l) ? 80 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => `• ${x.l.replace(/\s+/g, " ").slice(0, 220)}`);
  return [
    `Meeting "${title}" — extractive digest (LLM unavailable):`,
    ...(ranked.length ? ranked : [`• ${transcript.replace(/\s+/g, " ").slice(0, 500)}`]),
  ].join("\n");
}

const ACTION_PATTERNS = [
  /(?:action item|todo|follow[- ]?up)\s*[:\-]\s*(.{5,160})/gi,
  /\b([A-Z][a-zA-Z .]{2,24})\s+(?:will|is going to|to)\s+(.{5,140})/gi,
  /\bwe (?:need|have) to\s+(.{5,160})/gi,
];

function extractActionItemsHeuristic(transcript: string): { who: string; what: string; due?: string }[] {
  const found: { who: string; what: string; due?: string }[] = [];
  const seen = new Set<string>();
  for (const re of ACTION_PATTERNS) {
    for (const m of transcript.matchAll(re)) {
      let who = "team";
      let what = "";
      if (m.length >= 3) { who = m[1].trim().slice(0, 40); what = m[2].trim(); }
      else if (m.length === 2) { what = m[1].trim(); }
      what = what.replace(/\s+/g, " ").replace(/[.,;]+$/, "");
      const dueMatch = what.match(/\b(?:by|before|until)\s+((?:mon|tues?|wednes|thurs?|fri|satur?|sun)day|tomorrow|today|next week|eod|end of (?:the )?week|\d{1,2}\/\d{1,2})/i);
      if (dueMatch) what = what.replace(dueMatch[0], "").trim();
      const key = what.toLowerCase().slice(0, 60);
      if (!what || what.length < 8 || seen.has(key)) continue;
      seen.add(key);
      found.push({ who, what: what.slice(0, 180), ...(dueMatch ? { due: dueMatch[1] } : {}) });
      if (found.length >= 8) return found;
    }
  }
  return found;
}

/** LLM: summary + action items in one call. Returns null on any failure (caller falls back). */
async function llmMeetingDigest(title: string, transcript: string, participants?: string): Promise<{ summary: string; actionItems: { who: string; what: string; due?: string }[] } | null> {
  try {
    const zai = await ZAI.create();
    const res = await zai.chat.completions.create({
      messages: [{
        role: "user",
        content: `You process meeting transcripts. For the meeting "${title}"${participants ? ` with participants: ${participants}` : ""} produce:
1. A dense summary (max ~250 words): what was discussed, every decision made (exact wording matters), blockers, open questions.
2. Action items as a JSON array. Each item: {"who": person responsible (or "team"), "what": the commitment (imperative), "due": deadline or omit}. Include ONLY real commitments, max 8. [] if none.

Reply in EXACTLY this format:
SUMMARY:
<summary text>
ACTIONS:
<json array>`,
      }],
    });
    const text = res?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.length < 30) return null;
    const sumMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?:ACTIONS:|$)/i);
    const actMatch = text.match(/ACTIONS:\s*([\s\S]*)/i);
    const summary = sumMatch?.[1]?.trim();
    if (!summary) return null;
    let actionItems: { who: string; what: string; due?: string }[] = [];
    if (actMatch) {
      const jsonStr = actMatch[1].slice(actMatch[1].indexOf("["), actMatch[1].lastIndexOf("]") + 1);
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          actionItems = parsed
            .filter((a: Record<string, unknown>) => a && typeof a.what === "string")
            .slice(0, 8)
            .map((a: Record<string, unknown>) => ({
              who: String(a.who ?? "team").slice(0, 40),
              what: String(a.what).slice(0, 180),
              ...(typeof a.due === "string" && a.due ? { due: a.due.slice(0, 40) } : {}),
            }));
        }
      } catch { /* malformed JSON — keep [] */ }
    }
    return { summary: summary.slice(0, 4000), actionItems };
  } catch {
    return null;
  }
}

/** Push action items onto the global tasks.json board (cap 12 total, meetings add up to 6). */
async function pushActionItemsToBoard(userId: string, meetingTitle: string, items: { what: string }[]): Promise<number> {
  if (!items.length) return 0;
  const page = await findGlobalLedgerPage(userId, "tasks.json");
  let tasks: Record<string, unknown>[] = [];
  if (page) {
    try {
      const parsed = JSON.parse(page.content);
      if (Array.isArray(parsed)) tasks = parsed;
    } catch { /* malformed — reset */ }
  }
  const room = Math.max(0, 12 - tasks.length);
  const additions = items.slice(0, Math.min(6, room)).map((it) => ({
    task: `${it.what} (from meeting: ${meetingTitle})`,
    priority: 3,
  }));
  if (!additions.length) return 0;
  await upsertGlobalLedgerPage(userId, "tasks.json", JSON.stringify([...tasks, ...additions]));
  return additions.length;
}

export async function ingestMeeting(opts: {
  userId: string;
  title: string;
  transcript: string;
  platform?: string;
  participants?: string;
  date?: string;
  sessionId?: string | null;
}): Promise<MeetingIngestResult> {
  const title = opts.title.trim().slice(0, 120);
  if (!title) throw new Error("title is required");
  const transcript = opts.transcript.trim();
  if (transcript.length < 40) throw new Error("transcript is too short to be a meeting (min 40 chars)");
  const source = meetingSource(title);

  // 1. full transcript → chunked vector memory (reuses the document pipeline,
  //    hash-deduped: re-uploading the same transcript is a no-op)
  const doc = await ingestDocument({ userId: opts.userId, filename: source, text: transcript, sessionId: opts.sessionId ?? null });

  // 2. summary + action items (LLM with deterministic fallback)
  const header = `[meeting:${title}${opts.platform ? ` · ${opts.platform}` : ""}${opts.participants ? ` · with ${opts.participants}` : ""}${opts.date ? ` · ${opts.date}` : ""}]`;
  const llm = await llmMeetingDigest(title, transcript, opts.participants);
  const summary = llm?.summary ?? extractiveSummary(transcript, title);
  const summaryMethod = llm ? "llm" : "extractive";
  const actionItems = llm?.actionItems ?? extractActionItemsHeuristic(transcript);

  // 3. replace any previous summary memory for this meeting, then store fresh
  const oldSummaries = await db.memory.findMany({ where: { userId: opts.userId, kind: "summary", source }, select: { id: true } });
  if (oldSummaries.length) {
    await db.memory.deleteMany({ where: { id: { in: oldSummaries.map((s) => s.id) }, userId: opts.userId } });
  }

  const content = [
    `${header} SUMMARY:`,
    summary,
    ...(actionItems.length ? ["", "ACTION ITEMS:", ...actionItems.map((a) => `☐ ${a.who}: ${a.what}${a.due ? ` (by ${a.due})` : ""}`)] : []),
  ].join("\n");
  const summaryMemory = await db.memory.create({
    data: {
      userId: opts.userId,
      sessionId: opts.sessionId ?? null,
      kind: "summary",
      content: content.slice(0, 8000),
      source,
      importance: 0.8,
      // embed fields written right after (same as ingest pipeline)
      embedding: "[]",
    },
  });
  const { embedToJson, extractKeywords } = await import("./vector");
  await db.memory.update({
    where: { id: summaryMemory.id },
    data: { embedding: embedToJson(embed(content)), keywords: extractKeywords(title + " " + summary).join(",") },
  });

  // 4. action items → global tasks.json board
  const pushed = await pushActionItemsToBoard(opts.userId, title, actionItems);

  queueSync(opts.userId);
  await recordStat({
    userId: opts.userId,
    action: "meeting",
    detail: { title, chunks: doc.chunks, status: doc.status, actionItems: actionItems.length, pushedToBoard: pushed, summaryMethod },
  });

  return {
    source,
    status: doc.status,
    chunks: doc.chunks,
    tokensEst: doc.tokensEst,
    summary,
    summaryMethod,
    actionItems,
    summaryMemoryId: summaryMemory.id,
  };
}

// ─── listing & search ────────────────────────────────────────────────────────

export interface MeetingListItem {
  source: string;
  title: string;
  platform: string | null;
  chunks: number;
  tokensEst: number;
  summary: string | null;
  actionItems: string[];
  lastAt: string;
}

export async function listMeetings(userId: string, take = 30): Promise<MeetingListItem[]> {
  const rows = await db.memory.groupBy({
    by: ["source"],
    where: { userId, source: { startsWith: MEETING_SOURCE_PREFIX } },
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  const sources = rows.map((r) => r.source).filter((s): s is string => !!s);
  if (!sources.length) return [];
  const [summaries, allChunks] = await Promise.all([
    db.memory.findMany({
      where: { userId, source: { in: sources }, kind: "summary" },
      orderBy: { updatedAt: "desc" },
      select: { source: true, content: true },
    }),
    db.memory.findMany({
      where: { userId, source: { in: sources } },
      select: { source: true, content: true },
    }),
  ]);
  const summaryBy = new Map(summaries.map((s) => [s.source, s.content]));
  const estTokens = new Map<string, number>();
  for (const c of allChunks) {
    if (!c.source) continue;
    estTokens.set(c.source, (estTokens.get(c.source) ?? 0) + Math.ceil(c.content.length / 4));
  }
  return rows
    .map((r) => {
      const source = r.source as string;
      const title = source.slice(MEETING_SOURCE_PREFIX.length);
      const summaryText = summaryBy.get(source) ?? null;
      const platMatch = summaryText?.match(/^\[meeting:[^\]]*·\s*([^·\]]+)\]/);
      const actions = (summaryText ?? "").split("ACTION ITEMS:")[1]?.split("\n").filter((l) => l.trim().startsWith("☐")).map((l) => l.trim().slice(0, 200)) ?? [];
      return {
        source,
        title,
        platform: platMatch?.[1]?.trim() ?? null,
        chunks: r._count._all,
        tokensEst: estTokens.get(source) ?? 0,
        summary: summaryText ? summaryText.split("ACTION ITEMS:")[0].replace(/^\[meeting:[^\]]*\]\s*SUMMARY:\s*/, "").trim() : null,
        actionItems: actions,
        lastAt: (r._max.updatedAt ?? new Date(0)).toISOString(),
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0, take);
}

export interface MeetingSearchHit {
  source: string;
  title: string;
  excerpt: string;
  score: number;
  kind: string;
}

/** Semantic search scoped to meeting transcripts + summaries (the "ask my meetings" flow). */
export async function searchMeetings(userId: string, question: string, limit = 8): Promise<MeetingSearchHit[]> {
  const pool = await db.memory.findMany({
    where: { userId, source: { startsWith: MEETING_SOURCE_PREFIX }, archived: false, quarantined: false, supersededBy: null },
    select: { id: true, kind: true, content: true, source: true, embedding: true, updatedAt: true },
    take: 800,
    orderBy: { updatedAt: "desc" },
  });
  if (!pool.length) return [];
  let qvec: Float64Array | null = null;
  try { qvec = embed(question); } catch { qvec = null; }
  const now = Date.now();
  const qLower = question.toLowerCase();
  const scored = pool
    .map((m) => {
      let sim = 0;
      if (qvec) { try { sim = cosineSimilarity(qvec, embedFromJson(m.embedding)); } catch { sim = 0; } }
      const substring = m.content.toLowerCase().includes(qLower) ? 0.35 : 0;
      const ageDays = (now - new Date(m.updatedAt).getTime()) / 86400000;
      const recency = Math.exp(-ageDays / 30) * 0.08;
      const summaryBoost = m.kind === "summary" ? 0.12 : 0;
      return { m, score: sim + substring + recency + summaryBoost };
    })
    .filter((x) => x.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map(({ m, score }) => ({
    source: m.source ?? "",
    title: (m.source ?? "").slice(MEETING_SOURCE_PREFIX.length),
    excerpt: m.content.replace(/\s+/g, " ").slice(0, 340),
    score: Math.round(score * 1000) / 1000,
    kind: m.kind,
  }));
}
