/**
 * ZaiMem Document Ingestion
 * ─────────────────────────────────────────────────────────────────────────────
 * Turns whole documents (PDF / DOCX / TXT / MD text already extracted) into
 * searchable long-term memory:
 *
 *   1. chunkText()     — ~600-token chunks with overlap, paragraph/sentence aware
 *   2. ingestDocument()— embeds every chunk as a `document`-kind memory tagged
 *                        with the source filename, dedupes by content hash:
 *                        same file again → no-op; changed file → old chunks
 *                        replaced. Re-callable and idempotent by design.
 *
 * Chunks are self-describing ("[doc:report.pdf · part 2/14] …") so vector
 * recall and enhance_context can cite the file they came from.
 */

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { embed, embedToJson, extractKeywords } from "./vector";
import { queueSync } from "./github";

const CHUNK_TARGET_CHARS = 2400; // ≈ 600 tokens
const CHUNK_OVERLAP_CHARS = 320; // ≈ 80 tokens of carry-over context
export const INGEST_MAX_CHARS = 400_000; // hard cap on extracted text (~100k tokens)
const DOC_IMPORTANCE = 0.7;

/** Normalize + split text into overlapping, boundary-aware chunks. */
export function chunkText(raw: string, target = CHUNK_TARGET_CHARS, overlap = CHUNK_OVERLAP_CHARS): string[] {
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return [];
  if (text.length <= target) return [text];

  const chunks: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = "";
  };

  const packOversized = (p: string): string[] => {
    // split long paragraphs at sentence boundaries, hard-wrap monsters
    const sentences = p.split(/(?<=[.!?。！？])\s+/);
    const pieces: string[] = [];
    let s = "";
    for (const sent of sentences) {
      if (!sent) continue;
      if (sent.length > target) {
        if (s) { pieces.push(s); s = ""; }
        for (let i = 0; i < sent.length; i += target) pieces.push(sent.slice(i, i + target));
        continue;
      }
      if (s && (s + " " + sent).length > target) { pieces.push(s); s = sent; }
      else s = s ? `${s} ${sent}` : sent;
    }
    if (s) pieces.push(s);
    return pieces;
  };

  for (const para of text.split(/\n\n+/)) {
    for (const piece of para.length > target ? packOversized(para) : [para]) {
      if (cur && (cur + "\n\n" + piece).length > target) {
        flush();
        const prev = chunks[chunks.length - 1] ?? "";
        const tail = prev.slice(-overlap);
        cur = tail && prev.length > overlap ? `${tail}\n\n${piece}` : piece;
      } else {
        cur = cur ? `${cur}\n\n${piece}` : piece;
      }
    }
  }
  flush();
  return chunks;
}

export function tokensEstimate(chars: number): number {
  return Math.ceil(chars / 4);
}

function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function safeFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "document").trim();
  return (base || "document").slice(0, 120);
}

export interface IngestResult {
  status: "ingested" | "replaced" | "unchanged";
  filename: string;
  docHash: string;
  chunks: number; // chunk count in the document
  memories: number; // memory rows created
  replacedOld?: number; // old rows removed (replaced mode)
  chars: number;
  tokensEst: number;
}

export async function ingestDocument(opts: {
  userId: string;
  filename: string;
  text: string;
  sessionId?: string | null;
  importance?: number;
}): Promise<IngestResult> {
  const filename = safeFilename(opts.filename);
  const text = (opts.text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) throw new Error("text is required");
  if (text.length > INGEST_MAX_CHARS) {
    throw new Error(`document too large: ${text.length} chars (max ${INGEST_MAX_CHARS})`);
  }
  const docHash = shortHash(text);
  const importance = Math.min(1, Math.max(0, opts.importance ?? DOC_IMPORTANCE));

  // idempotency: same filename already ingested
  const existing = await db.memory.findMany({
    where: { userId: opts.userId, source: filename },
    select: { id: true, docHash: true },
  });
  if (existing.length > 0 && existing[0]?.docHash === docHash) {
    return {
      status: "unchanged", filename, docHash, chunks: existing.length,
      memories: 0, chars: text.length, tokensEst: tokensEstimate(text.length),
    };
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error("no extractable text content");

  let replacedOld = 0;
  if (existing.length > 0) {
    const del = await db.memory.deleteMany({
      where: { userId: opts.userId, source: filename },
    });
    replacedOld = del.count;
  }

  const total = chunks.length;
  const rows: {
    userId: string; sessionId: string | null; kind: string; content: string;
    keywords: string; embedding: string; importance: number;
    source: string; docHash: string;
  }[] = [];
  for (let i = 0; i < total; i++) {
    const header = `[doc:${filename} · part ${i + 1}/${total}]`;
    const content = `${header}\n\n${chunks[i]}`.slice(0, 8000);
    rows.push({
      userId: opts.userId,
      sessionId: opts.sessionId ?? null,
      kind: "document",
      content,
      keywords: extractKeywords(chunks[i]).concat(filename.replace(/\.[a-z0-9]+$/i, "")).slice(0, 8).join(","),
      embedding: embedToJson(embed(chunks[i])), // embed the raw chunk, header adds noise
      importance,
      source: filename,
      docHash,
    });
  }
  await db.memory.createMany({ data: rows });
  queueSync(opts.userId); // cloud DB mirror (debounced)

  return {
    status: replacedOld > 0 ? "replaced" : "ingested",
    filename, docHash, chunks: total, memories: rows.length,
    replacedOld: replacedOld || undefined,
    chars: text.length, tokensEst: tokensEstimate(text.length),
  };
}

/** List distinct ingested documents with chunk counts (for UI summaries). */
export async function listDocuments(userId: string) {
  const rows = await db.memory.groupBy({
    by: ["source", "docHash"],
    where: { userId, kind: "document", source: { not: null } },
    _count: { id: true },
    _max: { updatedAt: true },
  });
  return rows.map((r) => ({
    filename: r.source ?? "",
    docHash: r.docHash ?? "",
    chunks: r._count.id,
    updatedAt: r._max.updatedAt,
  }));
}
