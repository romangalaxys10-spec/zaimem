/**
 * ZaiMem Token Saver
 * ─────────────────────────────────────────────────────────────────────────────
 * Compresses bloated conversation history into a dense, information-preserving
 * digest so the agent keeps working with far fewer context tokens.
 *
 * Two-stage pipeline:
 *  1. Extractive pre-pass — sentence scoring (keyword density, position,
 *     recency, meta-signals like "decision/error/requirement") keeps the most
 *     informative sentences. Deterministic, zero-latency fallback.
 *  2. LLM re-compression via z-ai-web-dev-sdk (graceful: on any failure we
 *     fall back to the extractive result).
 *
 * Token accounting: estimateTokens() ≈ chars/4 (works well for mixed EN text).
 * Every compression event is recorded in UsageStat for the dashboard.
 */

import ZAI from "z-ai-web-dev-sdk";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

const SIGNAL_WORDS = [
  "decision", "decided", "must", "requirement", "error", "failed", "bug",
  "important", "remember", "preference", "prefer", "goal", "constraint",
  "deadline", "token", "key", "password", "url", "endpoint", "api", "todo",
  "next step", "conclusion", "summary", "root cause", "fix", "solution",
  "architecture", "budget", "name", "email", "约定", "决定", "重要", "目标",
  "需求", "错误", "总结",
];

interface ScoredSentence {
  text: string;
  score: number;
  idx: number;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?。！？])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function scoreSentences(text: string): ScoredSentence[] {
  const sentences = splitSentences(text);
  const total = sentences.length;
  const freq = new Map<string, number>();
  const wordsOf = (s: string) =>
    s.toLowerCase().match(/[a-z0-9\u4e00-\u9fff]{2,}/g) ?? [];
  const all = wordsOf(text);
  for (const w of all) freq.set(w, (freq.get(w) ?? 0) + 1);

  return sentences.map((s, idx) => {
    const words = wordsOf(s);
    if (words.length === 0) return { text: s, score: 0, idx };
    // keyword density
    let dens = 0;
    for (const w of words) dens += (freq.get(w) ?? 0) / all.length;
    dens = dens / Math.sqrt(words.length);

    // meta signal boost
    const lower = s.toLowerCase();
    let signal = 0;
    for (const kw of SIGNAL_WORDS) if (lower.includes(kw)) signal += 0.35;

    // position: first & last sentences carry framing + latest state
    const pos = idx === 0 ? 0.5 : idx >= total - 2 ? 0.4 : 0;
    // length penalty for ultra-short fragments
    const lenPenalty = s.length < 25 ? -0.25 : 0;
    // bullet / list items are usually dense facts
    const bullet = /^([-*•]|\d+[.)])\s/.test(s) ? 0.3 : 0;
    // quoted user requirements
    const quote = /["「『].+["」』]/.test(s) ? 0.2 : 0;

    return { text: s, score: dens * 3 + signal + pos + bullet + quote + lenPenalty, idx };
  });
}

/** Stage 1: extractive compression to ~ratio of original (0 < ratio <= 1). */
export function extractiveCompress(text: string, ratio = 0.35): string {
  const scored = scoreSentences(text);
  if (scored.length <= 3) return text;
  const target = Math.max(2, Math.round(scored.length * ratio));
  const kept = [...scored].sort((a, b) => b.score - a.score).slice(0, target).sort((a, b) => a.idx - b.idx);
  return kept.map((k) => k.text).join(" ");
}

interface ChatMessageLike {
  role: string;
  content: string;
}

/** Flatten messages into a transcript for compression. */
export function flattenMessages(messages: ChatMessageLike[]): string {
  return messages
    .map((m) => {
      const role = m.role === "user" ? "USER" : m.role === "assistant" ? "ASSISTANT" : m.role.toUpperCase();
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return `${role}: ${content}`;
    })
    .join("\n\n");
}

/** Stage 2: LLM digest with deterministic fallback. */
export async function llmDigest(transcript: string, focusHint?: string, targetRatio = 0.25): Promise<string | null> {
  try {
    const zai = await ZAI.create();
    // target word budget from the requested keep-ratio (clamped to a sane band)
    const targetWords = Math.max(100, Math.min(900, Math.floor((transcript.length / 4) * targetRatio * 0.85)));
    const prompt = `Compress the following conversation transcript into a dense working digest. Rules:
- Preserve ALL durable facts, decisions, names, numbers, URLs, constraints, open questions and next steps. Losing a decision is worse than being verbose.
- Drop small talk, filler, repeated context and verbose explanations.
- Target length: about ${targetWords} words. Never invent information.
${focusHint ? `- Extra attention to: ${focusHint}` : ""}

TRANSCRIPT:
${transcript.slice(0, 60000)}`;

    const res = await zai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
    });
    const text = res?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim().length > 10 ? text.trim() : null;
  } catch {
    return null;
  }
}

export interface SaveTokensResult {
  compressed: string;
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  ratio: number; // achieved compression 0..1
  method: "llm" | "extractive";
}

/**
 * Compress conversation history. Accepts either `messages` (chat array) or raw `text`.
 */
export async function saveTokens(opts: {
  messages?: ChatMessageLike[];
  text?: string;
  targetRatio?: number; // desired keep-ratio of original size, default 0.25
  focusHint?: string;
  useLlm?: boolean;
}): Promise<SaveTokensResult> {
  const raw = opts.messages?.length
    ? flattenMessages(opts.messages)
    : opts.text ?? "";
  const tokensBefore = estimateTokens(raw);
  if (tokensBefore < 60) {
    // too small to be worth compressing
    return {
      compressed: raw,
      tokensBefore,
      tokensAfter: tokensBefore,
      tokensSaved: 0,
      ratio: 1,
      method: "extractive",
    };
  }

  const targetRatio = Math.min(0.9, Math.max(0.05, opts.targetRatio ?? 0.25));

  // LLM path
  if (opts.useLlm !== false) {
    const digest = await llmDigest(raw, opts.focusHint, targetRatio);
    if (digest) {
      const tokensAfter = estimateTokens(digest);
      if (tokensAfter < tokensBefore * 0.85) {
        return {
          compressed: digest,
          tokensBefore,
          tokensAfter,
          tokensSaved: tokensBefore - tokensAfter,
          ratio: tokensAfter / tokensBefore,
          method: "llm",
        };
      }
    }
  }

  // Extractive fallback
  const compressed = extractiveCompress(raw, targetRatio);
  const tokensAfter = estimateTokens(compressed);
  return {
    compressed,
    tokensBefore,
    tokensAfter,
    tokensSaved: Math.max(0, tokensBefore - tokensAfter),
    ratio: tokensAfter / tokensBefore,
    method: "extractive",
  };
}
