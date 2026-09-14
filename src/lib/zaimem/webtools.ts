/**
 * ZaiMem universal tools (v1.7) — the zero-config staples the MCP ecosystem
 * keeps reinventing (fetch / search / time / calc / sequential thinking),
 * wired into ZaiMem's memory pipeline: what agents read here can be stored,
 * cited and recalled later. No external API keys — search & page reading run
 * through the built-in z-ai-web-dev-sdk.
 */

import ZAI from "z-ai-web-dev-sdk";

// ─── web_search ──────────────────────────────────────────────────────────────

export interface WebSearchHit {
  url: string;
  name: string;
  snippet: string;
  host: string;
  rank: number;
  date: string;
}

export async function webSearch(query: string, num = 6, recencyDays?: number): Promise<WebSearchHit[]> {
  const zai = await ZAI.create();
   
  const res = await zai.functions.invoke("web_search", { query, num: Math.min(10, Math.max(1, num)), ...(recencyDays ? { recency_days: recencyDays } : {}) } as any);
  const items = Array.isArray(res) ? res : [];
  return items.map((r, i) => ({
    url: String(r?.url ?? ""),
    name: String(r?.name ?? ""),
    snippet: String(r?.snippet ?? "").slice(0, 400),
    host: String(r?.host_name ?? ""),
    rank: typeof r?.rank === "number" ? r.rank : i + 1,
    date: String(r?.date ?? ""),
  })).filter((r) => r.url);
}

// ─── web_fetch (page_reader → readable text, auto-trimmed for LLM use) ───────

export interface PageFetchResult {
  url: string;
  title: string;
  text: string; // extracted readable text (html stripped)
  totalChars: number;
  truncated: boolean;
}

/** Strip html to readable text without extra deps: tags off, entities common, whitespace squeezed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function webFetch(url: string, maxChars = 20000): Promise<PageFetchResult> {
  const zai = await ZAI.create();
   
  const res: any = await zai.functions.invoke("page_reader", { url } as any);
  const data = res?.data ?? {};
  const html = String(data.html ?? "");
  const text = htmlToText(html);
  return {
    url: String(data.url ?? url),
    title: String(data.title ?? "").slice(0, 300),
    text: text.slice(0, maxChars),
    totalChars: text.length,
    truncated: text.length > maxChars,
  };
}

// ─── calc (safe arithmetic evaluator — no eval, no Function) ─────────────────

/**
 * Evaluate a arithmetic expression with a tiny shunting-yard parser.
 * Supports + - * / % ^ ( ) and unary minus. Anything else (letters, backticks)
 * is rejected — this is a calculator, not a code executor.
 */
export function safeCalc(exprRaw: string): number {
  const expr = exprRaw.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!expr || /[^0-9+\-*/%^().]/.test(expr)) throw new Error("only numbers and + - * / % ^ ( ) are allowed");
  if (expr.length > 200) throw new Error("expression too long");

  const tokens: (string | number)[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const n = parseFloat(expr.slice(i, j));
      if (Number.isNaN(n)) throw new Error("bad number");
      tokens.push(n);
      i = j;
    } else {
      tokens.push(c);
      i++;
    }
  }

  // shunting-yard → RPN
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3, "u-": 4 };
  const out: (string | number)[] = [];
  const ops: string[] = [];
  let prev: string | number | null = null;
  for (const t of tokens) {
    if (typeof t === "number") {
      out.push(t);
    } else if (t === "(") {
      ops.push(t);
    } else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop() as string);
      if (!ops.length) throw new Error("unbalanced parentheses");
      ops.pop();
    } else {
      // unary minus: minus at start or after an operator / open paren
      const isUnary = t === "-" && (prev === null || (typeof prev === "string" && prev !== ")"));
      const op = isUnary ? "u-" : t;
      while (ops.length && ops[ops.length - 1] !== "(" && prec[ops[ops.length - 1]] >= prec[op]) {
        out.push(ops.pop() as string);
      }
      ops.push(op);
    }
    prev = t;
  }
  while (ops.length) {
    const op = ops.pop() as string;
    if (op === "(") throw new Error("unbalanced parentheses");
    out.push(op);
  }

  const st: number[] = [];
  for (const t of out) {
    if (typeof t === "number") { st.push(t); continue; }
    if (t === "u-") {
      const a = st.pop();
      if (a === undefined) throw new Error("bad expression");
      st.push(-a);
      continue;
    }
    const b = st.pop(), a = st.pop();
    if (a === undefined || b === undefined) throw new Error("bad expression");
    if (t === "+") st.push(a + b);
    else if (t === "-") st.push(a - b);
    else if (t === "*") st.push(a * b);
    else if (t === "/") { if (b === 0) throw new Error("division by zero"); st.push(a / b); }
    else if (t === "%") { if (b === 0) throw new Error("division by zero"); st.push(a % b); }
    else if (t === "^") st.push(Math.pow(a, b));
  }
  if (st.length !== 1 || !Number.isFinite(st[0])) throw new Error("bad expression");
  return st[0];
}

// ─── time ────────────────────────────────────────────────────────────────────

export interface TimeInfo {
  iso: string;
  epochMs: number;
  utc: string;
  local: string; // rendered in the requested timezone (or UTC)
  timezone: string;
  weekday: string;
  weekNumber: number;
}

export function timeNow(timezone?: string): TimeInfo {
  const now = new Date();
  let tz = timezone || "UTC";
  let local: string;
  try {
    // throws for unknown zones → fall back to UTC
    local = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, dateStyle: "full", timeStyle: "long",
    }).format(now);
  } catch {
    tz = "UTC";
    local = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "full", timeStyle: "long" }).format(now);
  }
  const weekNumber = Math.ceil((((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86400000) + new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).getUTCDay() + 1) / 7);
  return {
    iso: now.toISOString(),
    epochMs: now.getTime(),
    utc: now.toUTCString(),
    local,
    timezone: tz,
    weekday: new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long" }).format(now),
    weekNumber,
  };
}
