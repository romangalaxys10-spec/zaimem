"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BrainCircuit, KeyRound, DatabaseZap, Gauge, ScanSearch,
  Layers, ShieldCheck, Loader2, ArrowRight, Github,
  Check, Terminal, Lock, RefreshCw, FileJson, Braces,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────
   Design language — "enterprise instrument" (Linear / Vercel / Stripe school)
   · one neutral near-black surface, hairline borders, no ambient glow
   · a single accent (violet) used sparingly; color otherwise is semantic
     (emerald = success/recall, amber = compression, rose = threat/blocked)
   · real product artifacts instead of illustration: config JSON, agent
     wordmarks, live tool-call loops, audited security claims
   · all loops are pure CSS (globals.css zm-*) and disabled under
     prefers-reduced-motion
   ────────────────────────────────────────────────────────────────────── */

/** memory chips embed into a breathing vector grid */
function DemoMemory() {
  const chips = [
    { t: "fact · deploy key rotates Friday", d: "0s" },
    { t: "pref · concise answers", d: "0.9s" },
    { t: "decision · Postgres 16 over 15", d: "1.8s" },
  ];
  return (
    <div className="zm-anim flex h-full items-center gap-4 px-4">
      <div className="flex w-1/2 flex-col gap-1.5">
        {chips.map((c) => (
          <div
            key={c.t}
            className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] leading-3 text-zinc-300"
            style={{ animation: `zm-in 4.5s ease-in-out ${c.d} infinite both` }}
          >
            {c.t}
          </div>
        ))}
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
      <div className="grid w-1/2 grid-cols-6 gap-1.5">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-violet-400/80"
            style={{ animation: `zm-dot 2.4s ease-in-out ${i * 0.13}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

/** scattered notes assemble into one context block */
function DemoEnhancer() {
  const bars = ["w-3/4", "w-1/2", "w-2/3"];
  return (
    <div className="zm-anim flex h-full items-center justify-center gap-3 px-4">
      <div className="flex flex-col gap-1.5">
        {bars.map((w, i) => (
          <div
            key={i}
            className={`h-1.5 ${w} rounded-full bg-zinc-700`}
            style={{ animation: `zm-in 4.5s ease-in-out ${i * 0.6}s infinite both` }}
          />
        ))}
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
      <div
        className="rounded-lg border border-white/[0.08] bg-black/40 p-2.5"
        style={{ animation: "zm-glow 3s ease-in-out infinite" }}
      >
        <div className="mb-1.5 flex items-center gap-1 text-[9px] font-medium text-emerald-300">
          <ScanSearch className="h-2.5 w-2.5" /> enhance_context
        </div>
        <div className="space-y-1">
          <div className="h-1.5 w-32 rounded-full bg-emerald-500/40" />
          <div className="h-1.5 w-24 rounded-full bg-emerald-500/25" />
        </div>
      </div>
    </div>
  );
}

/** a bloated history bar compresses into a digest */
function DemoTokens() {
  return (
    <div className="zm-anim flex h-full flex-col justify-center gap-2.5 px-5">
      <div className="flex items-center gap-2 text-[9px] text-zinc-500">
        <Gauge className="h-3 w-3" /> history
        <span className="h-2 rounded-full bg-zinc-600" style={{ animation: "zm-shrink 4.5s ease-in-out infinite" }} />
      </div>
      <div className="flex items-center gap-2 text-[9px] text-zinc-500">
        <Terminal className="h-3 w-3" /> digest
        <span className="h-2 w-[26%] rounded-full bg-violet-400/80" />
        <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-300">−62%</span>
      </div>
      <p className="text-[9px] text-zinc-600">1,240 → 470 tokens · counted in your dashboard</p>
    </div>
  );
}

/** skill pills trigger themselves in sequence */
function DemoSkills() {
  const skills = [
    { n: "smart", d: "0s" },
    { n: "context-boost", d: "0.75s" },
    { n: "token-frugal", d: "1.5s" },
  ];
  return (
    <div className="zm-anim flex h-full items-center justify-center gap-2 px-4">
      {skills.map((s) => (
        <span
          key={s.n}
          className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] text-zinc-300"
          style={{ animation: `zm-in 3s ease-in-out ${s.d} infinite both` }}
        >
          {s.n}
        </span>
      ))}
    </div>
  );
}

/** a private token assembles itself, then checks green */
function DemoToken() {
  const parts = ["x7k2", "m9qa", "1c4d"];
  return (
    <div className="zm-anim flex h-full items-center justify-center gap-1.5 px-4 font-mono text-xs">
      <span className="font-semibold text-zinc-100">zm_</span>
      {parts.map((p, i) => (
        <span
          key={p}
          className="rounded bg-white/[0.06] px-1.5 py-1 text-zinc-300"
          style={{ animation: `zm-in 3.6s ease-in-out ${i * 0.55}s infinite both` }}
        >
          {p}
        </span>
      ))}
      <span className="text-zinc-400" style={{ animation: "zm-blink 1s steps(1) infinite" }}>▍</span>
      <Check
        className="ml-1 h-3.5 w-3.5 text-emerald-400"
        style={{ animation: "zm-in 3.6s ease-in-out 1.9s infinite both" }}
      />
    </div>
  );
}

/** ZaiMem ⇄ GitHub sync with packets travelling the wire */
function DemoCloud() {
  return (
    <div className="zm-anim relative flex h-full items-center px-6">
      <div className="relative h-px flex-1 bg-white/[0.12]">
        <span className="absolute -top-[3px] h-1.5 w-1.5 rounded-full bg-zinc-200" style={{ animation: "zm-travel 2.8s linear infinite" }} />
        <span className="absolute -top-[3px] h-1.5 w-1.5 rounded-full bg-zinc-400" style={{ animation: "zm-travel-rev 2.8s linear 1.4s infinite" }} />
      </div>
      <div className="absolute left-2 flex flex-col items-center gap-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.06]">
          <BrainCircuit className="h-3.5 w-3.5 text-zinc-200" />
        </div>
        <span className="text-[8px] text-zinc-600">ZaiMem</span>
      </div>
      <div className="absolute right-2 flex flex-col items-center gap-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.06]">
          <Github className="h-3.5 w-3.5 text-zinc-200" />
        </div>
        <span className="text-[8px] text-zinc-600">your repo</span>
      </div>
    </div>
  );
}

/** an injected instruction is deflected by the guard */
function DemoGuard() {
  return (
    <div className="zm-anim relative flex h-full items-center justify-end gap-3 px-5">
      <div
        className="absolute left-5 top-1/2 -translate-y-1/2 rounded-md border border-rose-500/30 bg-rose-500/[0.07] px-2 py-1 text-[9px] text-rose-300/90"
        style={{ animation: "zm-deflect 3.6s ease-in-out infinite" }}
      >
        ignore previous instructions…
      </div>
      <div
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/[0.06]"
        style={{ animation: "zm-shield 3.6s ease-in-out infinite" }}
      >
        <ShieldCheck className="h-4 w-4 text-rose-300" />
      </div>
      <span
        className="rounded-full border border-rose-500/20 bg-rose-500/[0.08] px-2 py-0.5 text-[9px] font-semibold text-rose-300"
        style={{ animation: "zm-in 3.6s ease-in-out 1.7s infinite both" }}
      >
        blocked · data ≠ instructions
      </span>
    </div>
  );
}

/* ── feature data ─────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: DatabaseZap,
    title: "Auto vector memory",
    body: "Every durable fact, decision and preference is embedded on-device (384-dim hashed n-gram vectors) and stored in your private memory space. Near-duplicates auto-merge at 0.94 / 0.80 similarity thresholds.",
    Demo: DemoMemory,
    wide: true,
  },
  {
    icon: ScanSearch,
    title: "Context enhancer",
    body: "Before each non-trivial answer the agent calls enhance_context: relevant cross-session memories are recalled, ranked and injected as a silent inventory block.",
    Demo: DemoEnhancer,
  },
  {
    icon: Gauge,
    title: "Token saver",
    body: "When history bloats, save_tokens compresses it into a dense digest (LLM + extractive fallback). Every saved token is counted in your dashboard.",
    Demo: DemoTokens,
  },
  {
    icon: Layers,
    title: "Smart-skill orchestration",
    body: "GVS5H ledger loop, auto-trigger detection, difficulty-adaptive budgets (2/6/12), reflection schema and workflow memory — ported from zcode-smart-skill.",
    Demo: DemoSkills,
  },
  {
    icon: KeyRound,
    title: "Instant private token",
    body: "No signup, no password. A private token (zm_…) IS your account — login anywhere with it, revoke by regenerating.",
    Demo: DemoToken,
  },
  {
    icon: Github,
    title: "GitHub Cloud DB",
    body: "Pair a PAT and ZaiMem auto-creates a private repo in your account, mirroring every session, memory, vector and skill in real time. Your data, your repo.",
    Demo: DemoCloud,
  },
  {
    icon: ShieldCheck,
    title: "Prompt-injection guard",
    body: "Ledger contents are treated as data, never instructions. The TRUST clause from smart-skill E10 is baked into every tool response.",
    Demo: DemoGuard,
  },
];

/* ── everything-included brief: the full inventory, grouped ─────────── */

const INCLUDED: { group: string; items: { name: string; desc: string }[] }[] = [
  {
    group: "Memory & context",
    items: [
      { name: "On-device vector memory", desc: "384-dim embeddings, cosine recall" },
      { name: "Auto dedupe & merge", desc: "0.94 / 0.80 similarity thresholds" },
      { name: "Context enhancer", desc: "ranked recall, silent injection" },
      { name: "Token saver", desc: "LLM digest + extractive fallback" },
      { name: "Token accounting", desc: "every saved token counted" },
      { name: "Document ingestion", desc: "PDF / DOCX / TXT → chunked vectors" },
      { name: "Pinned & forget", desc: "always-in-force pins · preview-then-delete" },
      { name: "Meeting intelligence", desc: "transcript → summary → action items" },
      { name: "HEADROOM compression", desc: "togglable harder context compression" },
    ],
  },
  {
    group: "Skills & sessions",
    items: [
      { name: "Smart-skill ledger", desc: "notes.md + tasks.json loop" },
      { name: "Auto trigger detection", desc: "skills fire when they apply" },
      { name: "Difficulty budgets", desc: "light 2 · medium 6 · deep 12" },
      { name: "Handoff briefs", desc: "TRUST-clause protected summaries" },
      { name: "Session timeline", desc: "full transcripts & summaries" },
      { name: "Pre-created sessions", desc: "bootstrap prompts to continue anywhere" },
      { name: "Session handoffs", desc: "paste-ready prompt for any fresh agent chat" },
      { name: "Project agent teams", desc: "connect agents, shared brief, files & memory" },
      { name: "Universal tools", desc: "web search · web fetch · calc · time · think" },
      { name: "MCP tool packs", desc: "33 tools in 8 packs — every pack on/off" },
      { name: "8 SKILL.md skills", desc: "smart, meeting-notes, web-research & more" },
    ],
  },
  {
    group: "Cloud & backup",
    items: [
      { name: "GitHub Cloud DB", desc: "your private repo mirrors everything" },
      { name: "Scheduled daily backup", desc: "heartbeat snapshot ~every 24h" },
      { name: "One-PAT account rescue", desc: "re-sync everything from your old repo" },
      { name: "Point-in-time restore", desc: "roll memories back to any snapshot commit" },
      { name: "AES-256 export / import", desc: "encrypted, portable archives" },
      { name: "JSON account export", desc: "one-click full-data download" },
      { name: "Global search ⌘K", desc: "sessions, memories, ledger, skills" },
    ],
  },
  {
    group: "Platform & privacy",
    items: [
      { name: "MCP server", desc: "33 tools · 4 resources · JSON-RPC 2.0" },
      { name: "Tool-pack gating", desc: "agents only see what you allow" },
      { name: "Prompt-injection guard", desc: "ledger is data, never instructions" },
      { name: "Local vector engine", desc: "no external embedding APIs" },
      { name: "Hardened by audit", desc: "v1.7.2 full security audit & fixes" },
      { name: "Docker deploy", desc: "one command, GHCR image" },
    ],
  },
];

const STEPS = [
  { n: "01", title: "Open ZaiMem", body: "A private token is generated for you automatically — no email, no password." },
  { n: "02", title: "Add the MCP endpoint", body: "In any MCP-capable agent (chat.z.ai, Claude Code, Cursor, Cline, Windsurf, Trae, Antigravity, zcode, Koda, Pi, Grok…), add the ZaiMem server with your endpoint URL + token." },
  { n: "03", title: "Paste the magic prompt", body: "The dashboard hands you a ready-made prompt containing the endpoint and your key." },
  { n: "04", title: "Chat enhanced", body: "The session auto-syncs: memories boot, context gets boosted, tokens get saved, skills auto-trigger." },
];

const AGENTS = ["chat.z.ai", "Claude Code", "Cursor", "Cline", "Windsurf", "Trae", "Antigravity", "zcode", "Koda", "Pi", "Grok"];

const STATS = [
  { v: "33", l: "MCP tools" },
  { v: "4", l: "MCP resources" },
  { v: "8", l: "togglable tool packs" },
  { v: "150", l: "e2e checks, green" },
];

const SECURITY = [
  { icon: Lock, t: "SHA-256 token storage", d: "Plaintext tokens are never persisted; login tokens live as hashes." },
  { icon: FileJson, t: "AES-256-GCM at rest", d: "GitHub PATs encrypted with a scrypt-derived key from ZAIMEM_SECRET." },
  { icon: Gauge, t: "Rate limiting", d: "Auth init 60 req / 5 min per IP; MCP 1200 req / min per token." },
  { icon: ShieldCheck, t: "Injection guard", d: "Memory is data, never instructions — enforced in every tool response." },
  { icon: Braces, t: "Audited & hardened", d: "Full security audit in v1.7.2: token migration, batch caps, security headers." },
];

const FOOTER_COLS: { h: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    h: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "What's included", href: "#included" },
      { label: "How it works", href: "#how" },
      { label: "Get started", href: "#start" },
    ],
  },
  {
    h: "Resources",
    links: [
      { label: "GitHub repository", href: "https://github.com/romangalaxys10-spec/zaimem", external: true },
      { label: "README & docs", href: "https://github.com/romangalaxys10-spec/zaimem#readme", external: true },
      { label: "Changelog", href: "https://github.com/romangalaxys10-spec/zaimem/blob/main/CHANGELOG.md", external: true },
      { label: "Docker image (GHCR)", href: "https://github.com/romangalaxys10-spec/zaimem/pkgs/container/zaimem", external: true },
    ],
  },
  {
    h: "Project",
    links: [
      { label: "Built with GLM 5.3 Flash", href: "https://z.ai/subscribe?ic=ROK78RJKNW", external: true },
      { label: "Lead by Roman · Rommark.Dev", href: "https://rommark.dev", external: true },
      { label: "Telegram blog", href: "https://t.me/VibeCodePrompterSystem", external: true },
      { label: "The Claw blog", href: "https://claw.rommark.dev", external: true },
      { label: "Z-Assist Project", href: "https://zhelp.space-z.ai/", external: true },
    ],
  },
];

/* ── hero demo window: one agent chat, looping the whole pipeline ─────── */

function HeroDemo() {
  const rows = [
    { d: "0s", el: (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-white/[0.07] px-3.5 py-2 text-xs leading-relaxed text-zinc-100 ring-1 ring-white/[0.08]">
          Remember: the deploy key rotates on Friday. I prefer short answers.
        </div>
      </div>
    ) },
    { d: "2.4s", el: (
      <div className="flex items-center gap-2">
        <span className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] text-zinc-200">zaimem_remember ✓</span>
        <span className="text-[10px] text-zinc-500">stored as fact · 384-dim vector embedded</span>
      </div>
    ) },
    { d: "4.8s", el: (
      <div className="rounded-xl border border-white/[0.08] bg-black/40 p-3" style={{ animation: "zm-row 14.4s ease-in-out 4.8s infinite both, zm-glow 4s ease-in-out 4.8s infinite" }}>
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-emerald-300">
          <ScanSearch className="h-3 w-3" /> enhance_context → 2 memories recalled
        </div>
        <p className="text-[10px] leading-relaxed text-zinc-500">deploy key rotates Friday · user prefers short answers</p>
      </div>
    ) },
    { d: "7.2s", el: (
      <div className="flex items-center gap-2">
        <span className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] text-zinc-200">save_tokens ✓</span>
        <span className="text-[10px] text-zinc-500">digest 1,240 → 470 (−62%)</span>
      </div>
    ) },
  ];
  return (
    <div className="zm-anim overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] shadow-2xl shadow-black/40">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="ml-2 font-mono text-[11px] text-zinc-500">any MCP agent — Claude Code · Cursor · Cline · chat.z.ai</span>
      </div>
      {/* looping conversation */}
      <div className="flex h-[240px] flex-col justify-end gap-2.5 px-4 pb-3 pt-4 sm:h-[260px]">
        {rows.map((r, i) => (
          <div key={i} style={{ animation: `zm-row 14.4s ease-in-out ${r.d} infinite both` }}>
            {r.el}
          </div>
        ))}
      </div>
      {/* status bar */}
      <div className="flex items-center gap-2 border-t border-white/[0.06] px-4 py-2 font-mono text-[10px] text-zinc-500">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ animation: "zm-dot 2s ease-in-out infinite" }} />
        session synced · auto-sync on · memory booted
      </div>
    </div>
  );
}

/** MCP config block — the real artifact an engineer pastes */
function ConfigBlock({ baseUrl }: { baseUrl: string }) {
  const cfg = `{
  "mcpServers": {
    "zaimem": {
      "url": "${baseUrl}/api/mcp",
      "headers": { "Authorization": "Bearer zm_…" }
    }
  }
}`;
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/50">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <span className="font-mono text-[11px] text-zinc-500">mcp.json</span>
        <span className="font-mono text-[10px] text-zinc-600">streamable HTTP · JSON-RPC 2.0</span>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[11px] leading-relaxed text-zinc-300">{cfg}</pre>
    </div>
  );
}

interface LandingProps {
  onToken: (token: string) => void;
}

export function Landing({ onToken }: LandingProps) {
  const [creating, setCreating] = useState(false);
  const [loginToken, setLoginToken] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createToken() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/init", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create token");
      onToken(data.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  async function login() {
    const t = loginToken.trim();
    if (!t) return;
    setLoggingIn(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Invalid token");
      onToken(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoggingIn(false);
    }
  }

  const reveal = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-60px" },
  } as const;

  const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-zinc-100 antialiased">
      {/* single, restrained top glow */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(139,124,246,0.07),transparent_70%)]" aria-hidden />

      {/* nav */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0a0a0b]/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
          <a href="#start" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.06]">
              <BrainCircuit className="h-4 w-4 text-zinc-100" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">ZaiMem</span>
            <span className="ml-1 hidden rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline">v1.8</span>
          </a>
          <div className="hidden items-center gap-8 text-[13px] text-zinc-400 md:flex">
            <a href="#features" className="transition-colors hover:text-zinc-100">Features</a>
            <a href="#included" className="transition-colors hover:text-zinc-100">Included</a>
            <a href="#how" className="transition-colors hover:text-zinc-100">How it works</a>
            <a href="#security" className="transition-colors hover:text-zinc-100">Security</a>
            <a href="https://github.com/romangalaxys10-spec/zaimem" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-zinc-100">
              <Github className="h-3.5 w-3.5" /> GitHub
            </a>
          </div>
          <a
            href="#start"
            className="rounded-lg bg-zinc-100 px-3.5 py-1.5 text-[13px] font-medium text-zinc-900 transition-colors hover:bg-white"
          >
            Get started
          </a>
        </nav>
      </header>

      <main className="relative z-10">
        {/* ── hero ─────────────────────────────────────────────────────── */}
        <section id="start" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
          <motion.div {...reveal} transition={{ duration: 0.5, ease }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-xs text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" aria-hidden />
              MCP-native memory · works with every MCP client
            </span>
          </motion.div>

          <motion.h1
            {...reveal}
            transition={{ duration: 0.55, delay: 0.06, ease }}
            className="mx-auto mt-7 max-w-3xl text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-white sm:text-6xl"
          >
            Your agents forget.
            <span className="block text-zinc-500">ZaiMem doesn&apos;t.</span>
          </motion.h1>

          <motion.p
            {...reveal}
            transition={{ duration: 0.55, delay: 0.12, ease }}
            className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-zinc-400 sm:text-[17px]"
          >
            Persistent vector memory, automatic context enhancement and token
            accounting for every MCP agent — one endpoint, one token, zero setup.
          </motion.p>

          <motion.div
            {...reveal}
            transition={{ duration: 0.55, delay: 0.18, ease }}
            className="mx-auto mt-8 flex max-w-md flex-col items-center gap-3 sm:max-w-none sm:flex-row sm:justify-center"
          >
            <Button
              size="lg"
              onClick={createToken}
              disabled={creating}
              className="h-11 rounded-lg bg-zinc-100 px-6 text-[14px] font-semibold text-zinc-900 shadow-none transition-colors hover:bg-white active:bg-zinc-300"
            >
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              {creating ? "Generating…" : "Get your private token"}
            </Button>
            <div className="flex items-center gap-2">
              <Input
                value={loginToken}
                onChange={(e) => setLoginToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()}
                placeholder="Have a token? zm_…"
                className="h-11 w-48 rounded-lg border-white/[0.1] bg-white/[0.03] font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-violet-500/40 sm:w-52"
              />
              <Button
                variant="outline"
                size="lg"
                onClick={login}
                disabled={loggingIn || !loginToken.trim()}
                className="h-11 rounded-lg border-white/[0.1] bg-white/[0.03] px-4 text-zinc-300 hover:bg-white/[0.07] hover:text-white"
                aria-label="Log in with token"
              >
                {loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          </motion.div>
          {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

          {/* agent wordmarks */}
          <motion.div
            {...reveal}
            transition={{ duration: 0.55, delay: 0.24, ease }}
            className="mt-14"
            aria-label="Compatible agents"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-600">Works with</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-7 gap-y-2.5">
              {AGENTS.map((a) => (
                <span key={a} className="text-[13px] font-medium text-zinc-500 transition-colors hover:text-zinc-300">{a}</span>
              ))}
            </div>
          </motion.div>

          {/* product demo window */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.65, delay: 0.1, ease }}
            className="mx-auto mt-12 max-w-2xl"
          >
            <HeroDemo />
          </motion.div>
        </section>

        {/* ── stats band ───────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6" aria-label="Key numbers">
          <motion.div
            {...reveal}
            transition={{ duration: 0.55, ease }}
            className="grid grid-cols-2 divide-white/[0.06] rounded-2xl border border-white/[0.06] bg-white/[0.02] sm:grid-cols-4 sm:divide-x"
          >
            {STATS.map((s) => (
              <div key={s.l} className="px-6 py-7 text-center">
                <p className="font-mono text-3xl font-semibold tracking-tight text-white">{s.v}</p>
                <p className="mt-1.5 text-xs text-zinc-500">{s.l}</p>
              </div>
            ))}
          </motion.div>
        </section>

        {/* ── features ─────────────────────────────────────────────────── */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <motion.div {...reveal} transition={{ duration: 0.55, ease }} className="mb-12 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-400">Features</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl">
              Seven systems. One endpoint.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
              Each card below is a live loop showing exactly what happens under the hood — no illustrations, no mockups.
            </p>
          </motion.div>

          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: (i % 3) * 0.06, ease }}
                className={f.wide ? "sm:col-span-2" : ""}
              >
                <div className="flex h-full flex-col bg-[#0a0a0b] p-6 transition-colors duration-200 hover:bg-white/[0.02]">
                  <div className={`mb-5 flex items-center justify-center rounded-lg border border-white/[0.05] bg-black/30 ${f.wide ? "h-24" : "h-16"}`}>
                    <f.Demo />
                  </div>
                  <div className="flex items-center gap-2.5">
                    <f.icon className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                    <h3 className="text-[14px] font-semibold tracking-tight text-white">{f.title}</h3>
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-zinc-500">{f.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── wire it in ───────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <motion.div {...reveal} transition={{ duration: 0.55, ease }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-400">Setup</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl">
                Wire it in under a minute.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
                ZaiMem speaks standard MCP over streamable HTTP. Point any MCP client at the endpoint with your
                bearer token — or paste the magic prompt from the dashboard and the agent wires itself up.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Works in chat.z.ai, Claude Code, Cursor, Cline, Windsurf, Trae, Grok and every other MCP client",
                  "Session auto-syncs on first message — memories boot, context enhances, tokens get counted",
                  "33 tools, 4 resources; disable whole capability groups per user from the dashboard",
                ].map((li) => (
                  <li key={li} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-zinc-400">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
                    {li}
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div {...reveal} transition={{ duration: 0.55, delay: 0.1, ease }}>
              <ConfigBlock baseUrl="https://zaimem.space-z.ai" />
              <p className="mt-3 text-xs text-zinc-600">
                Self-hosting? Point the URL at your own deployment — the Docker image is on GHCR.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── everything included ──────────────────────────────────────── */}
        <section id="included" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <motion.div {...reveal} transition={{ duration: 0.55, ease }} className="mb-12 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-400">What&apos;s included</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl">
              Everything included. Nothing to wire.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
              One endpoint ships all of it. Every system below is live in the box — no plugins, no config, no extra keys.
            </p>
          </motion.div>

          <motion.div
            {...reveal}
            transition={{ duration: 0.6, delay: 0.08, ease }}
            className="grid gap-10 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 sm:grid-cols-2 sm:p-10 lg:grid-cols-4"
          >
            {INCLUDED.map((g) => (
              <div key={g.group}>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{g.group}</h3>
                <ul className="mt-4 space-y-3.5">
                  {g.items.map((it) => (
                    <li key={it.name} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium leading-4 text-zinc-300">{it.name}</p>
                        <p className="mt-0.5 text-xs leading-4 text-zinc-600">{it.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </motion.div>
        </section>

        {/* ── how it works ─────────────────────────────────────────────── */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <motion.div {...reveal} transition={{ duration: 0.55, ease }} className="mb-12 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-400">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl">One prompt. Zero setup.</h2>
          </motion.div>

          <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="absolute left-0 right-0 top-7 hidden h-px bg-white/[0.06] lg:block" aria-hidden />
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08, ease }}
                className="relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5"
              >
                <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-[#0a0a0b] font-mono text-xs font-semibold text-violet-300">
                  {s.n}
                </span>
                <h3 className="mt-4 text-[14px] font-semibold tracking-tight text-white">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── security ─────────────────────────────────────────────────── */}
        <section id="security" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <motion.div {...reveal} transition={{ duration: 0.55, ease }} className="mb-12 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-400">Security</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl">
              Built like it holds something that matters.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
              Because it does. ZaiMem shipped a full security audit (v1.7.2) — the findings were fixed, not filed.
            </p>
          </motion.div>

          <motion.div
            {...reveal}
            transition={{ duration: 0.6, delay: 0.08, ease }}
            className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-5"
          >
            {SECURITY.map((s) => (
              <div key={s.t} className="bg-[#0a0a0b] p-5">
                <s.icon className="h-4 w-4 text-zinc-400" aria-hidden />
                <p className="mt-3 text-[13px] font-semibold text-zinc-200">{s.t}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">{s.d}</p>
              </div>
            ))}
          </motion.div>
        </section>

        {/* ── GitHub free cloud backup band ─────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <motion.div
            {...reveal}
            transition={{ duration: 0.55, ease }}
            className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-12 sm:px-10"
          >
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.05]">
                    <Github className="h-4.5 w-4.5 text-zinc-100" />
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">GitHub Cloud DB</p>
                </div>
                <h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
                  Free unlimited memory hosting — on your GitHub.
                </h2>
                <p className="mt-4 text-[14px] leading-relaxed text-zinc-400">
                  Pair a Personal Access Token and every session, memory, project and meeting auto-syncs
                  in real time to a private repo in your own GitHub account. Private repos are free —
                  no card, no plan, two-minute setup.
                </p>
                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5"><Lock className="h-3 w-3" /> only the paired token can read the repo</span>
                  <span className="flex items-center gap-1.5"><RefreshCw className="h-3 w-3" /> real-time sync + daily backup</span>
                  <span className="flex items-center gap-1.5"><Github className="h-3 w-3" /> revoke anytime on GitHub</span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {[
                  { n: "1", t: "Open the pre-filled token link", d: "Cloud DB tab → GitHub opens with the repo scope pre-set." },
                  { n: "2", t: "Generate & copy", d: "Click Generate, copy the token (ghp_…). Encrypted before storage." },
                  { n: "3", t: "Paste & pair", d: "ZaiMem creates your private repo and mirrors everything." },
                ].map((st) => (
                  <div key={st.n} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/[0.1] font-mono text-[10px] font-bold text-zinc-300">{st.n}</span>
                    <p className="mt-2 text-[13px] font-medium text-zinc-200">{st.t}</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-600">{st.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </section>

        {/* ── closing CTA ──────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <motion.div
            {...reveal}
            transition={{ duration: 0.55, ease }}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-16 text-center"
          >
            <h2 className="text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl">
              Give your agent a memory.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[15px] text-zinc-400">
              One token, one prompt — every chat after that is enhanced.
            </p>
            <Button
              size="lg"
              onClick={createToken}
              disabled={creating}
              className="mt-8 h-11 rounded-lg bg-zinc-100 px-8 text-[14px] font-semibold text-zinc-900 transition-colors hover:bg-white active:bg-zinc-300"
            >
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              {creating ? "Generating…" : "Get your private token"}
            </Button>
          </motion.div>
        </section>
      </main>

      {/* footer */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-3">
            {FOOTER_COLS.map((col) => (
              <div key={col.h}>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{col.h}</h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        {...(l.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                        className="text-[13px] text-zinc-400 transition-colors hover:text-zinc-100"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/[0.06] pt-6 text-xs text-zinc-600 sm:flex-row">
            <span className="flex items-center gap-1.5">
              <BrainCircuit className="h-3 w-3 text-zinc-500" aria-hidden />
              ZaiMem v1.8 — session memory & context enhancer for every MCP agent
            </span>
            <span>MIT License · © 2026 Rommark.Dev</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

