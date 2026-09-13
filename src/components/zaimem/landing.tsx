"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BrainCircuit, KeyRound, DatabaseZap, Gauge, ScanSearch,
  Layers, ShieldCheck, Sparkles, Loader2, ArrowRight, Github,
} from "lucide-react";

const FEATURES = [
  {
    icon: DatabaseZap,
    title: "Auto Vector Memory",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    body: "Every durable fact, decision and preference is embedded on-device (384-dim hashed n-gram vectors) and stored in your private memory space. Near-duplicates auto-merge.",
  },
  {
    icon: ScanSearch,
    title: "Context Enhancer",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    body: "Before each non-trivial answer the agent calls enhance_context: relevant cross-session memories are recalled, ranked and injected as a silent inventory block.",
  },
  {
    icon: Gauge,
    title: "Token Saver",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    body: "When history bloats, save_tokens compresses it into a dense digest (LLM + extractive fallback). Every saved token is counted in your dashboard.",
  },
  {
    icon: Layers,
    title: "Smart-Skill Orchestration",
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-500/10",
    body: "Ported from zcode-smart-skill: GVS5H ledger loop, auto-trigger detection, difficulty-adaptive budgets (2/6/12), reflection schema and workflow memory.",
  },
  {
    icon: KeyRound,
    title: "Instant Private Token",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    body: "No signup, no password. You get an automated private token (zm_…) that IS your account — login anywhere with it, revoke by regenerating.",
  },
  {
    icon: Github,
    title: "GitHub Cloud DB",
    color: "text-zinc-200",
    bg: "bg-zinc-500/10",
    body: "Pair your GitHub PAT — ZaiMem auto-creates a private repo in your account and mirrors every session, memory, vector and skill into it. Your data, your repo, your cloud DB.",
  },
  {
    icon: ShieldCheck,
    title: "Prompt-Injection Guard",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    body: "Ledger contents are treated as DATA, never instructions. The TRUST clause from smart-skill E10 is baked into every tool response.",
  },
];

const STEPS = [
  { n: "01", title: "Open ZaiMem", body: "You're here. A private token is generated for you automatically — no email, no password." },
  { n: "02", title: "Add the MCP endpoint", body: "In chat.z.ai agent mode, add the ZaiMem MCP server with your endpoint URL + token." },
  { n: "03", title: "Paste the magic prompt", body: "The dashboard hands you a ready-made prompt containing the endpoint and your key." },
  { n: "04", title: "Chat enhanced", body: "Session auto-syncs: memories boot, context gets boosted, tokens get saved, skills auto-trigger." },
];

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

  return (
    <div className="min-h-screen flex flex-col bg-[#08080c] text-zinc-100 overflow-x-hidden">
      {/* glow backdrop */}
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute -top-40 left-1/4 h-[480px] w-[720px] rounded-full bg-violet-600/20 blur-[140px]" />
        <div className="absolute top-1/3 -right-40 h-[420px] w-[520px] rounded-full bg-emerald-500/10 blur-[140px]" />
        <div className="absolute bottom-0 left-0 h-[360px] w-[480px] rounded-full bg-fuchsia-600/10 blur-[140px]" />
      </div>

      {/* header */}
      <header className="relative z-10 border-b border-white/5 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-900/40">
              <BrainCircuit className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight">ZaiMem</span>
              <span className="ml-2 hidden text-xs text-zinc-500 sm:inline">session memory & context enhancer</span>
            </div>
          </div>
          <a
            href="https://github.com/romangalaxys10-spec/zcode-smart-skill"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
          >
            <Github className="h-3.5 w-3.5" /> smart-skill
          </a>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        {/* hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Badge variant="outline" className="mb-6 border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs text-violet-300">
              <Sparkles className="mr-1.5 h-3 w-3" /> MCP-native · Built for chat.z.ai agent mode
            </Badge>
            <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
              Your chat.z.ai sessions
              <span className="block bg-gradient-to-r from-violet-400 via-fuchsia-400 to-emerald-400 bg-clip-text text-transparent">
                finally remember everything.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
              ZaiMem gives every chat.z.ai agent a persistent vector memory, an automatic
              context enhancer and a token saver. Generate a token, paste one prompt into
              agent mode — your session syncs itself.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mx-auto mt-10 max-w-xl"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                onClick={createToken}
                disabled={creating}
                className="h-12 flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-base font-semibold text-white shadow-lg shadow-violet-900/40 transition-transform hover:scale-[1.02] hover:from-violet-500 hover:to-fuchsia-500"
              >
                {creating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <KeyRound className="mr-2 h-5 w-5" />}
                {creating ? "Generating…" : "Get automated private token"}
              </Button>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
              <span className="hidden sm:inline">Already have a token?</span>
              <div className="flex flex-1 gap-2 sm:flex-none">
                <Input
                  value={loginToken}
                  onChange={(e) => setLoginToken(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && login()}
                  placeholder="zm_…"
                  className="h-10 flex-1 border-white/10 bg-white/5 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-violet-500/50 sm:w-64"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={login}
                  disabled={loggingIn || !loginToken.trim()}
                  className="h-10 border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
                >
                  {loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
          </motion.div>
        </section>

        {/* features */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
              >
                <Card className="h-full border-white/5 bg-white/[0.03] transition-colors hover:border-white/10 hover:bg-white/[0.05]">
                  <CardContent className="p-5">
                    <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${f.bg}`}>
                      <f.icon className={`h-5 w-5 ${f.color}`} />
                    </div>
                    <h3 className="mb-2 font-semibold text-zinc-100">{f.title}</h3>
                    <p className="text-sm leading-relaxed text-zinc-400">{f.body}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* how it works */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <h2 className="mb-8 text-center text-2xl font-bold tracking-tight sm:text-3xl">
            One prompt. Zero setup.
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="relative rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent p-5"
              >
                <span className="text-xs font-bold tracking-widest text-violet-400/80">{s.n}</span>
                <h3 className="mt-2 font-semibold text-zinc-100">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      {/* sticky footer */}
      <footer className="relative z-10 mt-auto border-t border-white/5 bg-black/30 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-zinc-500 sm:flex-row sm:px-6">
          <span>ZaiMem — session memory & context enhancer for chat.z.ai</span>
          <span className="flex items-center gap-1.5">
            Powered by <BrainCircuit className="h-3 w-3 text-violet-400" /> local vector engine · zcode-smart-skill port
          </span>
        </div>
      </footer>
    </div>
  );
}
