"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BrainCircuit, KeyRound, DatabaseZap, Gauge, ScanSearch,
  Layers, ShieldCheck, Sparkles, Loader2, ArrowRight, Github,
  Globe, Send, Newspaper, LifeBuoy, Check, Terminal, Lock, RefreshCw,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────
   Feature demos — small looping CSS animations that show how each
   feature works. All live inside `.zm-anim` containers; the loops are
   pure CSS keyframes declared in globals.css and disabled wholesale
   under prefers-reduced-motion.
   ────────────────────────────────────────────────────────────────────── */

/** memory chips embed into a breathing vector grid */
function DemoMemory() {
  const chips = [
    { t: "fact · deploy key rotates Friday", d: "0s" },
    { t: "pref · violet UI accents", d: "0.9s" },
    { t: "decision · Postgres 16 over 15", d: "1.8s" },
  ];
  return (
    <div className="zm-anim flex h-full items-center gap-4 px-4">
      <div className="flex w-1/2 flex-col gap-1.5">
        {chips.map((c) => (
          <div
            key={c.t}
            className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] leading-3 text-violet-200"
            style={{ animation: `zm-in 4.5s ease-in-out ${c.d} infinite both` }}
          >
            {c.t}
          </div>
        ))}
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
      <div className="grid w-1/2 grid-cols-6 gap-1.5">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-violet-400"
            style={{ animation: `zm-dot 2.4s ease-in-out ${i * 0.13}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

/** scattered notes assemble into one glowing context block */
function DemoEnhancer() {
  const bars = ["w-3/4", "w-1/2", "w-2/3"];
  return (
    <div className="zm-anim flex h-full items-center justify-center gap-3 px-4">
      <div className="flex flex-col gap-1.5">
        {bars.map((w, i) => (
          <div
            key={i}
            className={`h-1.5 ${w} rounded-full bg-zinc-600`}
            style={{ animation: `zm-in 4.5s ease-in-out ${i * 0.6}s infinite both` }}
          />
        ))}
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
      <div
        className="rounded-lg border bg-black/40 p-2.5"
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
      <div className="flex items-center gap-2 text-[9px] text-zinc-400">
        <Gauge className="h-3 w-3 text-amber-400" /> history
        <span className="h-2 rounded-full bg-amber-400/80" style={{ animation: "zm-shrink 4.5s ease-in-out infinite" }} />
      </div>
      <div className="flex items-center gap-2 text-[9px] text-zinc-400">
        <Terminal className="h-3 w-3 text-amber-400" /> digest
        <span className="h-2 w-[26%] rounded-full bg-amber-300/90" />
        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">−62%</span>
      </div>
      <p className="text-[9px] text-zinc-500">1,240 → 470 tokens · counted in your dashboard</p>
    </div>
  );
}

/** skill pills trigger themselves in sequence */
function DemoSkills() {
  const skills = [
    { n: "smart", d: "0s", c: "fuchsia" },
    { n: "context-boost", d: "0.75s", c: "violet" },
    { n: "token-frugal", d: "1.5s", c: "amber" },
  ];
  const tone: Record<string, string> = {
    fuchsia: "border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-200",
    violet: "border-violet-500/50 bg-violet-500/15 text-violet-200",
    amber: "border-amber-500/50 bg-amber-500/15 text-amber-200",
  };
  return (
    <div className="zm-anim flex h-full items-center justify-center gap-2 px-4">
      {skills.map((s) => (
        <span
          key={s.n}
          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${tone[s.c]}`}
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
      <span className="font-semibold text-cyan-300">zm_</span>
      {parts.map((p, i) => (
        <span
          key={p}
          className="rounded bg-cyan-500/10 px-1.5 py-1 text-cyan-200"
          style={{ animation: `zm-in 3.6s ease-in-out ${i * 0.55}s infinite both` }}
        >
          {p}
        </span>
      ))}
      <span className="text-cyan-300" style={{ animation: "zm-blink 1s steps(1) infinite" }}>▍</span>
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
      <div className="relative h-px flex-1 bg-gradient-to-r from-violet-500/50 via-white/20 to-emerald-500/50">
        <span className="absolute -top-[3px] h-1.5 w-1.5 rounded-full bg-violet-300" style={{ animation: "zm-travel 2.8s linear infinite" }} />
        <span className="absolute -top-[3px] h-1.5 w-1.5 rounded-full bg-emerald-300" style={{ animation: "zm-travel-rev 2.8s linear 1.4s infinite" }} />
      </div>
      <div className="absolute left-2 flex flex-col items-center gap-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600">
          <BrainCircuit className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-[8px] text-zinc-500">ZaiMem</span>
      </div>
      <div className="absolute right-2 flex flex-col items-center gap-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 bg-white/10">
          <Github className="h-3.5 w-3.5 text-zinc-100" />
        </div>
        <span className="text-[8px] text-zinc-500">your repo</span>
      </div>
    </div>
  );
}

/** an injected instruction is deflected by the shield */
function DemoGuard() {
  return (
    <div className="zm-anim relative flex h-full items-center justify-end gap-3 px-5">
      <div
        className="absolute left-5 top-1/2 -translate-y-1/2 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[9px] text-rose-300"
        style={{ animation: "zm-deflect 3.6s ease-in-out infinite" }}
      >
        ignore previous instructions…
      </div>
      <div
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10"
        style={{ animation: "zm-shield 3.6s ease-in-out infinite" }}
      >
        <ShieldCheck className="h-4.5 w-4.5 text-rose-300" />
      </div>
      <span
        className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[9px] font-semibold text-rose-300"
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
    title: "Auto Vector Memory",
    accent: "text-violet-400",
    bg: "bg-violet-500/10",
    body: "Every durable fact, decision and preference is embedded on-device (384-dim hashed n-gram vectors) and stored in your private memory space. Near-duplicates auto-merge.",
    Demo: DemoMemory,
    wide: true,
  },
  {
    icon: ScanSearch,
    title: "Context Enhancer",
    accent: "text-emerald-400",
    bg: "bg-emerald-500/10",
    body: "Before each non-trivial answer the agent calls enhance_context: relevant cross-session memories are recalled, ranked and injected as a silent inventory block.",
    Demo: DemoEnhancer,
  },
  {
    icon: Gauge,
    title: "Token Saver",
    accent: "text-amber-400",
    bg: "bg-amber-500/10",
    body: "When history bloats, save_tokens compresses it into a dense digest (LLM + extractive fallback). Every saved token is counted in your dashboard.",
    Demo: DemoTokens,
  },
  {
    icon: Layers,
    title: "Smart-Skill Orchestration",
    accent: "text-fuchsia-400",
    bg: "bg-fuchsia-500/10",
    body: "Ported from zcode-smart-skill: GVS5H ledger loop, auto-trigger detection, difficulty-adaptive budgets (2/6/12), reflection schema and workflow memory.",
    Demo: DemoSkills,
  },
  {
    icon: KeyRound,
    title: "Instant Private Token",
    accent: "text-cyan-400",
    bg: "bg-cyan-500/10",
    body: "No signup, no password. You get an automated private token (zm_…) that IS your account — login anywhere with it, revoke by regenerating.",
    Demo: DemoToken,
  },
  {
    icon: Github,
    title: "GitHub Cloud DB",
    accent: "text-zinc-100",
    bg: "bg-zinc-500/10",
    body: "Pair your GitHub PAT — ZaiMem auto-creates a private repo in your account and mirrors every session, memory, vector and skill into it. Your data, your repo, your cloud DB.",
    Demo: DemoCloud,
  },
  {
    icon: ShieldCheck,
    title: "Prompt-Injection Guard",
    accent: "text-rose-400",
    bg: "bg-rose-500/10",
    body: "Ledger contents are treated as DATA, never instructions. The TRUST clause from smart-skill E10 is baked into every tool response.",
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
      { name: "Meeting intelligence", desc: "transcript → summary → action items (Tactiq-style)" },
      { name: "HEADROOM compression", desc: "togglable harder compression of context blocks" },
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
      { name: "MCP tool packs", desc: "33 tools in 8 packs — every pack on/off from the dashboard" },
      { name: "8 SKILL.md skills", desc: "smart, meeting-notes, web-research, project-team, doc-memory & more" },
    ],
  },
  {
    group: "Cloud & backup",
    items: [
      { name: "GitHub Cloud DB", desc: "your private repo mirrors everything" },
      { name: "Scheduled daily backup", desc: "heartbeat snapshot ~every 24h" },
      { name: "One-PAT account rescue", desc: "new account? re-sync everything from your old GitHub repo" },
      { name: "Point-in-time restore", desc: "roll memories back to any snapshot commit" },
      { name: "AES-256 export / import", desc: "encrypted, portable archives" },
      { name: "Global search ⌘K", desc: "sessions, memories, ledger, skills" },
      { name: "Kind & date filters", desc: "24h → 1 year, per category" },
    ],
  },
  {
    group: "Platform & privacy",
    items: [
      { name: "MCP server", desc: "33 tools · 4 resources · JSON-RPC 2.0" },
      { name: "Tool-pack gating", desc: "agents only see the capability groups you allow" },
      { name: "Batch calls & CORS", desc: "streamable HTTP transport" },
      { name: "Prompt-injection guard", desc: "ledger is data, never instructions" },
      { name: "Local vector engine", desc: "no external embedding APIs" },
      { name: "Docker deploy", desc: "one command, GHCR image" },
    ],
  },
];

const STEPS = [
  { n: "01", title: "Open ZaiMem", body: "You're here. A private token is generated for you automatically — no email, no password." },
  { n: "02", title: "Add the MCP endpoint", body: "In any MCP-capable agent (chat.z.ai, Claude Code, Cursor, Cline, Windsurf, Trae, Antigravity, zcode, Koda, Pi, Grok…), add the ZaiMem MCP server with your endpoint URL + token." },
  { n: "03", title: "Paste the magic prompt", body: "The dashboard hands you a ready-made prompt containing the endpoint and your key." },
  { n: "04", title: "Chat enhanced", body: "Session auto-syncs: memories boot, context gets boosted, tokens get saved, skills auto-trigger." },
];

const HERO_BADGES = [
  { icon: Sparkles, label: "Built with GLM 5.3 Flash", href: "https://z.ai/subscribe?ic=ROK78RJKNW", color: "text-violet-400" },
  { icon: Globe, label: "Lead by Roman · Rommark.Dev", href: "https://rommark.dev", color: "text-rose-400" },
  { icon: Send, label: "Telegram Blog", href: "https://t.me/VibeCodePrompterSystem", color: "text-sky-400" },
  { icon: Newspaper, label: "The Claw Blog", href: "https://claw.rommark.dev", color: "text-emerald-400" },
  { icon: LifeBuoy, label: "Author of Z-Assist Project", href: "https://zhelp.space-z.ai/", color: "text-amber-400" },
];

/* ── hero demo window: one agent chat, looping the whole pipeline ─────── */

function HeroDemo() {
  const rows = [
    { d: "0s", el: (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-violet-600/30 px-3.5 py-2 text-xs leading-relaxed text-violet-50 ring-1 ring-violet-500/30">
          Remember: the deploy key rotates on Friday. I prefer short answers.
        </div>
      </div>
    ) },
    { d: "2.4s", el: (
      <div className="flex items-center gap-2">
        <span className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 font-mono text-[10px] text-violet-200">zaimem_remember ✓</span>
        <span className="text-[10px] text-zinc-400">stored as fact · 384-dim vector embedded</span>
      </div>
    ) },
    { d: "4.8s", el: (
      <div className="rounded-xl border border-emerald-500/25 bg-black/40 p-3" style={{ animation: "zm-row 14.4s ease-in-out 4.8s infinite both, zm-glow 4s ease-in-out 4.8s infinite" }}>
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-emerald-300">
          <ScanSearch className="h-3 w-3" /> enhance_context → 2 memories recalled
        </div>
        <p className="text-[10px] leading-relaxed text-zinc-400">deploy key rotates Friday · user prefers short answers</p>
      </div>
    ) },
    { d: "7.2s", el: (
      <div className="flex items-center gap-2">
        <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] text-amber-200">save_tokens ✓</span>
        <span className="text-[10px] text-zinc-400">digest 1,240 → 470 (−62%)</span>
      </div>
    ) },
  ];
  return (
    <div className="zm-anim overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/50 backdrop-blur-sm" style={{ animation: "zm-floaty 7s ease-in-out infinite" }}>
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-2 text-[11px] text-zinc-400">any MCP agent — Claude Code · Cursor · Cline · chat.z.ai…</span>
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
      <div className="flex items-center gap-2 border-t border-white/5 px-4 py-2 text-[10px] text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ animation: "zm-dot 2s ease-in-out infinite" }} />
        session synced · auto-sync on · memory booted
      </div>
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
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-60px" },
  } as const;

  return (
    <div className="min-h-screen bg-[#08080c] text-zinc-100 antialiased">
      {/* ambient glow */}
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute -top-48 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[160px]" />
        <div className="absolute bottom-0 -right-40 h-[380px] w-[520px] rounded-full bg-emerald-500/8 blur-[160px]" />
      </div>

      {/* glass nav */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#08080c]/70 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <a href="#start" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-900/40">
              <BrainCircuit className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">ZaiMem</span>
          </a>
          <div className="hidden items-center gap-7 text-[13px] text-zinc-400 md:flex">
            <a href="#features" className="transition-colors hover:text-white">Features</a>
            <a href="#included" className="transition-colors hover:text-white">What's included</a>
            <a href="#how" className="transition-colors hover:text-white">How it works</a>
            <a href="https://github.com/romangalaxys10-spec/zaimem" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-white">
              <Github className="h-3.5 w-3.5" /> GitHub
            </a>
          </div>
          <a
            href="#start"
            className="rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-black transition-transform hover:scale-[1.04] active:scale-95"
          >
            Get started
          </a>
        </nav>
      </header>

      <main className="relative z-10">
        {/* ── hero ─────────────────────────────────────────────────────── */}
        <section id="start" className="mx-auto max-w-5xl scroll-mt-20 px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
          <motion.div {...reveal} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs text-zinc-300">
              <Sparkles className="h-3 w-3 text-violet-400" />
              MCP-native · Works with every MCP agent
            </span>
          </motion.div>

          <motion.h1
            {...reveal}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-6 max-w-4xl text-[44px] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-6xl lg:text-7xl"
          >
            Your AI agent sessions
            <span className="block bg-gradient-to-r from-violet-400 via-fuchsia-300 to-emerald-300 bg-clip-text text-transparent">
              finally remember everything.
            </span>
          </motion.h1>

          <motion.p
            {...reveal}
            transition={{ duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-zinc-400 sm:text-lg"
          >
            ZaiMem gives every AI agent a persistent vector memory, an automatic
            context enhancer and a token saver. Works with chat.z.ai, Claude Code, Cursor,
            Cline, Windsurf, Trae, Antigravity, zcode, Koda, Pi, Grok and any other MCP client —
            paste one prompt and your session syncs itself.
          </motion.p>

          <motion.div
            {...reveal}
            transition={{ duration: 0.6, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-9 max-w-xl"
          >
            <Button
              size="lg"
              onClick={createToken}
              disabled={creating}
              className="h-12 w-full rounded-full bg-white text-[15px] font-semibold text-black shadow-xl shadow-black/40 transition-all hover:scale-[1.02] hover:bg-zinc-200 active:scale-95 sm:w-auto sm:px-8"
            >
              {creating ? <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" /> : <KeyRound className="mr-2 h-4.5 w-4.5" />}
              {creating ? "Generating…" : "Get your private token"}
            </Button>
            <div className="mt-5 flex items-center justify-center gap-2 text-sm text-zinc-400">
              <span>Already have a token?</span>
              <div className="flex gap-2">
                <Input
                  value={loginToken}
                  onChange={(e) => setLoginToken(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && login()}
                  placeholder="zm_…"
                  className="h-9 w-44 rounded-full border-white/10 bg-white/[0.05] font-mono text-xs text-zinc-200 placeholder:text-zinc-500 focus-visible:ring-violet-500/50 sm:w-56"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={login}
                  disabled={loggingIn || !loginToken.trim()}
                  className="h-9 rounded-full border-white/10 bg-white/[0.05] px-3 text-zinc-200 hover:bg-white/10 hover:text-white"
                  aria-label="Log in with token"
                >
                  {loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
            <a
              href="#included"
              className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200"
            >
              See everything included <ArrowRight className="h-3 w-3 rotate-90" aria-hidden />
            </a>
          </motion.div>

          {/* project badges */}
          <motion.div
            {...reveal}
            transition={{ duration: 0.6, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="mt-9 flex flex-wrap items-center justify-center gap-2"
          >
            {HERO_BADGES.map((b) => (
              <a
                key={b.href}
                href={b.href}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              >
                <b.icon className={`h-3.5 w-3.5 ${b.color}`} />
                {b.label}
              </a>
            ))}
          </motion.div>

          {/* product demo window */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-16 max-w-2xl"
          >
            <HeroDemo />
          </motion.div>
        </section>

        {/* ── features ─────────────────────────────────────────────────── */}
        <section id="features" className="mx-auto max-w-5xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <motion.div {...reveal} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">Features</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-5xl">
              Everything your agent forgets — remembered.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-400 sm:text-base">
              Seven systems, one endpoint. Each card below is a live loop showing exactly what happens under the hood.
            </p>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: (i % 3) * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className={f.wide ? "sm:col-span-2" : ""}
              >
                <div className="group h-full rounded-3xl border border-white/[0.07] bg-white/[0.03] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/15 hover:bg-white/[0.05] hover:shadow-2xl hover:shadow-black/40">
                  <div className={`mb-4 flex h-16 items-center justify-center rounded-xl border border-white/5 bg-black/40 ${f.wide ? "h-24" : ""}`}>
                    <f.Demo />
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${f.bg}`}>
                      <f.icon className={`h-4 w-4 ${f.accent}`} />
                    </div>
                    <h3 className="text-[15px] font-semibold tracking-tight text-white">{f.title}</h3>
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-zinc-400">{f.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── everything included ──────────────────────────────────────── */}
        <section id="included" className="mx-auto max-w-5xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <motion.div {...reveal} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">What&apos;s included</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-5xl">
              Everything included. Nothing to wire.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-400 sm:text-base">
              One endpoint ships all of it. Every system below is live in the box — no plugins, no config, no extra keys.
            </p>
          </motion.div>

          <motion.div
            {...reveal}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-[2rem] border border-white/[0.07] bg-white/[0.03] p-6 backdrop-blur-sm sm:p-10"
          >
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {INCLUDED.map((g) => (
                <div key={g.group}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{g.group}</h3>
                  <ul className="mt-4 space-y-3.5">
                    {g.items.map((it) => (
                      <li key={it.name} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium leading-4 text-zinc-200">{it.name}</p>
                          <p className="mt-0.5 text-xs leading-4 text-zinc-500">{it.desc}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-col items-center gap-2 border-t border-white/[0.06] pt-6 text-center sm:flex-row sm:justify-between sm:text-left">
              <p className="text-[13px] text-zinc-400">
                All of it on one private token — and the full source is on GitHub, MIT-licensed.
              </p>
              <a
                href="https://github.com/romangalaxys10-spec/zaimem"
                target="_blank"
                rel="noreferrer"
                className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-violet-300 transition-colors hover:text-violet-200"
              >
                <Github className="h-3.5 w-3.5" /> Read the docs
              </a>
            </div>
          </motion.div>
        </section>

        {/* ── how it works ─────────────────────────────────────────────── */}
        <section id="how" className="mx-auto max-w-5xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <motion.div {...reveal} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-5xl">One prompt. Zero setup.</h2>
          </motion.div>

          <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-white/10 to-transparent lg:block" aria-hidden />
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="relative rounded-3xl border border-white/[0.07] bg-white/[0.03] p-5 backdrop-blur-sm"
              >
                <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-violet-500/30 bg-[#0d0d14] text-xs font-semibold text-violet-300">
                  {s.n}
                </span>
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-white">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── GitHub free cloud backup band ─────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
          <motion.div
            {...reveal}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-[2rem] border border-emerald-500/25 bg-gradient-to-b from-emerald-500/12 via-white/[0.03] to-transparent px-6 py-12 text-center sm:px-10"
          >
            <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[480px] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-[100px]" aria-hidden />
            <h2 className="relative text-2xl font-semibold tracking-[-0.02em] text-emerald-100 sm:text-3xl">
              Free unlimited memory hosting — on YOUR GitHub.
            </h2>
            <p className="relative mx-auto mt-3 max-w-2xl text-[14px] leading-relaxed text-zinc-300">
              Pair ZaiMem with a GitHub Personal Access Token and every session, memory, project & meeting auto-syncs
              <span className="font-semibold text-white"> in real time</span> to a <span className="font-semibold text-emerald-300">private repo in your own GitHub account</span>.
              Your memory stops eating local storage and survives anything. Private repos are <span className="font-semibold text-emerald-300">free on GitHub</span> — no card, no plan, 2-minute setup:
            </p>
            <div className="relative mx-auto mt-6 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
              {[
                { n: "1", t: "Open the pre-filled token link", d: "Cloud DB tab → GitHub opens with the repo scope pre-set." },
                { n: "2", t: "Generate & copy", d: "Click Generate, copy the token (ghp_…). Encrypted before storage." },
                { n: "3", t: "Paste & pair", d: "ZaiMem creates your private repo and mirrors everything, forever." },
              ].map((st) => (
                <div key={st.n} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/25 text-[10px] font-bold text-emerald-300">{st.n}</span>
                  <p className="mt-2 text-[13px] font-medium text-zinc-200">{st.t}</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">{st.d}</p>
                </div>
              ))}
            </div>
            <p className="relative mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> only the paired token can read the repo</span>
              <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3" /> real-time auto-sync + daily scheduled backup</span>
              <span className="flex items-center gap-1"><Github className="h-3 w-3" /> revoke anytime on GitHub</span>
            </p>
          </motion.div>
        </section>

        {/* ── closing CTA ──────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
          <motion.div
            {...reveal}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-violet-600/15 via-white/[0.03] to-transparent px-6 py-16 text-center"
          >
            <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[480px] -translate-x-1/2 rounded-full bg-violet-500/20 blur-[100px]" aria-hidden />
            <h2 className="relative text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
              Give your agent a memory.
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-[15px] text-zinc-400">
              One token, one prompt — every chat after that is enhanced.
            </p>
            <Button
              size="lg"
              onClick={createToken}
              disabled={creating}
              className="relative mt-8 h-12 rounded-full bg-white px-8 text-[15px] font-semibold text-black shadow-xl shadow-black/40 transition-all hover:scale-[1.03] hover:bg-zinc-200 active:scale-95"
            >
              {creating ? <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" /> : <KeyRound className="mr-2 h-4.5 w-4.5" />}
              {creating ? "Generating…" : "Get your private token"}
            </Button>
          </motion.div>
        </section>
      </main>

      {/* footer */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-black/30 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-zinc-400 sm:flex-row sm:px-6">
          <span>ZaiMem v1.7 — session memory & context enhancer for every MCP agent</span>
          <span className="flex items-center gap-1.5">
            Powered by <BrainCircuit className="h-3 w-3 text-violet-400" /> local vector engine · zcode-smart-skill port
          </span>
        </div>
      </footer>
    </div>
  );
}
