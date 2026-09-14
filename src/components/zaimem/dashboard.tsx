"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  BrainCircuit, KeyRound, Copy, Check, Eye, EyeOff, LogOut,
  MessageSquare, Database, Gauge, Zap, Terminal, Link2, ShieldCheck, RefreshCw, Github,
  Video, FolderKanban, Feather, CloudUpload, ArrowRight, Lock,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  buildMagicPrompt, buildMcpJsonConfig, mcpEndpoint, SETUP_STEPS,
} from "./magic-prompt";
import {
  SessionsPanel, MemoryPanel, SkillsPanel, StatsPanel,
  type AuthInfo, fmtTokens,
} from "./panels";
import { CloudDbPanel } from "./cloud-db";
import { ProjectsPanel } from "./projects-panel";
import { MeetingsPanel } from "./meetings-panel";
import { GlobalSearch, type SearchTarget } from "./search-bar";

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

// tab trigger styling — readable inactive state (zinc-300) + clear active state
const TAB_TRIGGER =
  "gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 " +
  "transition-colors hover:border-white/10 hover:bg-white/[0.06] hover:text-white " +
  "data-[state=active]:border-violet-500/30 data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-100";
const TAB_TRIGGER_CLOUD =
  "gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 " +
  "transition-colors hover:border-white/10 hover:bg-white/[0.06] hover:text-white " +
  "data-[state=active]:border-emerald-500/30 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-100";

/* ── onboarding checklist — progress auto-detected from real signals ── */

function OnboardingCard({
  sessions,
  memories,
  ghLinked,
  onGo,
}: {
  sessions: number;
  memories: number;
  ghLinked: boolean | null;
  onGo: (tab: string) => void;
}) {
  // dashboard renders client-side only (post-token), so a lazy localStorage
  // read is hydration-safe and needs no effect
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("zm.onboard.dismissed") === "1",
  );

  const steps = [
    { label: "Create your account", hint: "Done — your private token is live.", done: true, cta: null as string | null },
    { label: "Connect an agent & boot a session", hint: "Paste the magic prompt into any MCP agent.", done: sessions > 0, cta: sessions > 0 ? null : "connect" },
    { label: "Save your first memory", hint: "Facts, decisions and preferences persist automatically.", done: memories > 0, cta: memories > 0 ? null : "memory" },
    { label: "Mirror to your own GitHub (optional)", hint: "Free private-repo backup of everything.", done: !!ghLinked, cta: ghLinked ? null : "cloud" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const complete = doneCount === steps.length;

  if (complete || dismissed) return null;

  return (
    <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Feather className="h-4 w-4 text-violet-300" aria-hidden /> Getting started
          <span className="font-mono text-[11px] font-normal text-zinc-500">{doneCount}/{steps.length}</span>
        </h3>
        <button
          onClick={() => { localStorage.setItem("zm.onboard.dismissed", "1"); setDismissed(true); }}
          className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
          aria-label="Dismiss getting started checklist"
        >
          Dismiss
        </button>
      </div>
      <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-violet-500/70 transition-all duration-500" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border ${
                  s.done ? "border-emerald-500/40 bg-emerald-500/15" : "border-white/15 bg-white/[0.03]"
                }`}
                aria-hidden
              >
                {s.done && <Check className="h-3 w-3 text-emerald-400" />}
              </span>
              <div className="min-w-0">
                <p className={`text-[12.5px] font-medium leading-4 ${s.done ? "text-zinc-500 line-through decoration-zinc-600" : "text-zinc-200"}`}>
                  {s.label}
                </p>
                {!s.done && <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">{s.hint}</p>}
              </div>
            </div>
            {s.cta && (
              <Button size="sm" variant="outline" onClick={() => onGo(s.cta as string)}
                className="h-7 shrink-0 rounded-md border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-zinc-300 hover:bg-white/[0.09] hover:text-white">
                Go <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Dashboard({ token, onLogout }: DashboardProps) {
  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState("connect");
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);
  const [ghLinked, setGhLinked] = useState<boolean | null>(null);
  const [headroom, setHeadroom] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const magicPrompt = useMemo(() => buildMagicPrompt({ baseUrl, token }), [baseUrl, token]);
  const mcpJson = useMemo(() => buildMcpJsonConfig({ baseUrl, token }), [baseUrl, token]);
  const endpoint = useMemo(() => mcpEndpoint(baseUrl), [baseUrl]);

  const loadInfo = () => {
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setInfo(d);
        setHeadroom(!!d.headroom);
      })
      .catch(() => setInfo(null));
    fetch("/api/github", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setGhLinked(!!d?.linked))
      .catch(() => setGhLinked(null));
  };
  useEffect(loadInfo, []);

  // refresh counters when the user switches tabs (data changes via MCP outside the UI)
  useEffect(() => {
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setInfo(d))
      .catch(() => {});
  }, [tab, token]);

  async function toggleHeadroom(on: boolean) {
    setHeadroom(on);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ headroom: on }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast({ title: on ? "Headroom compression ON" : "Headroom compression OFF", description: on ? "Context blocks are now compressed harder — originals stay retrievable." : "Context blocks return to full length." });
    } catch {
      setHeadroom(!on);
      toast({ title: "Toggle failed", variant: "destructive" });
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast({ title: "Copied to clipboard", description: label });
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast({ title: "Copy failed", description: "Select the text manually and copy it.", variant: "destructive" });
    }
  }

  // global search navigation — jump to the right tab, deep-open sessions
  const handleSearchNavigate = (target: SearchTarget) => {
    if (target.kind === "session") {
      setFocusSessionId(target.id);
      setTab("sessions");
    } else if (target.kind === "ledger") {
      if (target.sessionId) {
        setFocusSessionId(target.sessionId);
        setTab("sessions");
      } else {
        setTab("skills"); // standalone ledger pages live under the smart-skill flow
      }
    } else if (target.kind === "memory") {
      setTab("memory");
    } else {
      setTab("skills");
    }
  };

  const CopyBtn = ({ text, label, small }: { text: string; label: string; small?: boolean }) => (
    <Button
      size="sm"
      variant="outline"
      onClick={() => copy(text, label)}
      className={`shrink-0 border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white ${small ? "h-7 text-[11px]" : "h-8"}`}
    >
      {copied === label ? <Check className="mr-1 h-3.5 w-3.5 text-emerald-400" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
      {copied === label ? "Copied" : "Copy"}
    </Button>
  );

  const stats = info?.counts;

  return (
    <div className="flex min-h-screen flex-col bg-[#08080c] text-zinc-100">
      {/* glow backdrop */}
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute -top-40 left-1/3 h-[420px] w-[640px] rounded-full bg-violet-600/15 blur-[140px]" />
        <div className="absolute bottom-0 -right-32 h-[360px] w-[480px] rounded-full bg-emerald-500/8 blur-[140px]" />
      </div>

      {/* header */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#08080c]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600">
              <BrainCircuit className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="font-bold tracking-tight">ZaiMem</span>
          </div>

          {/* global search */}
          <GlobalSearch token={token} onNavigate={handleSearchNavigate} />

          {/* headroom switch */}
          <div className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-1 pl-2.5 pr-1.5 sm:flex" title="Headroom mode — compress context injections harder (headroomlabs-ai/headroom pattern)">
            <Feather className={`h-3.5 w-3.5 shrink-0 ${headroom ? "text-amber-400" : "text-zinc-500"}`} />
            <span className="text-[11px] font-medium text-zinc-300">Headroom</span>
            <Switch checked={headroom} onCheckedChange={toggleHeadroom} className="scale-[0.8] data-[state=checked]:bg-amber-500" aria-label="Toggle headroom compression mode" />
          </div>

          {/* token chip */}
          <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-1 pl-2.5 pr-1">
            <KeyRound className="h-3.5 w-3.5 shrink-0 text-violet-400" />
            <code className="max-w-[140px] truncate font-mono text-xs text-zinc-300 sm:max-w-[220px]">
              {revealed ? token : token.slice(0, 7) + "••••••••••••" + token.slice(-4)}
            </code>
            <Button
              size="icon" variant="ghost" onClick={() => setRevealed((v) => !v)}
              className="h-6 w-6 text-zinc-400 hover:text-zinc-200" aria-label="Toggle token visibility"
            >
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="icon" variant="ghost" onClick={() => copy(token, "token")}
              className="h-6 w-6 text-zinc-400 hover:text-zinc-200" aria-label="Copy token"
            >
              {copied === "token" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <Button
            size="sm" variant="ghost" onClick={onLogout}
            className="h-8 text-zinc-400 hover:bg-white/5 hover:text-rose-300"
          >
            <LogOut className="mr-1 h-3.5 w-3.5" /> Log out
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {/* stat strip */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: MessageSquare, label: "Sessions", value: stats?.sessions ?? "…", color: "text-violet-400" },
            { icon: Database, label: "Memories", value: stats?.memories ?? "…", color: "text-emerald-400" },
            { icon: Gauge, label: "Tokens saved", value: stats ? fmtTokens(stats.tokensSaved) : "…", color: "text-amber-400" },
            { icon: Zap, label: "Active skills", value: stats?.skills ?? "…", color: "text-fuchsia-400" },
          ].map((s) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <Card className="border-white/5 bg-white/[0.03]">
                <CardContent className="flex items-center gap-3 p-4">
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                  <div>
                    <div className="text-xl font-bold leading-none text-zinc-100">{s.value}</div>
                    <div className="mt-1 text-[11px] text-zinc-400">{s.label}</div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* GitHub cloud backup promo — impossible to miss (when not paired) */}
        {ghLinked === false && (
          <div className="mb-6 overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/[0.12] via-emerald-500/[0.05] to-transparent">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
                  <CloudUpload className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-emerald-200">
                    FREE upgrade: host your memory on YOUR OWN GitHub private repo
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300">100% free · no card</Badge>
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                    Pair a GitHub token once and every session, memory, project & file is <span className="font-semibold text-white">auto-synced in real time</span> to a private repo in your GitHub account — so your memory doesn&apos;t eat ZaiMem&apos;s local storage and survives anything. It takes ~2 minutes:
                  </p>
                  <div className="mt-2 grid gap-1.5 text-[11px] text-zinc-400 sm:grid-cols-3">
                    <span><span className="mr-1 font-bold text-emerald-400">1.</span>In the Cloud DB tab, open the pre-filled token link → GitHub opens with the <code className="font-mono">repo</code> scope already set.</span>
                    <span><span className="mr-1 font-bold text-emerald-400">2.</span>Click Generate, copy the token (starts with <code className="font-mono">ghp_</code>).</span>
                    <span><span className="mr-1 font-bold text-emerald-400">3.</span>Paste it in the Cloud DB tab. Done — private repo appears in your account.</span>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500"><Lock className="h-3 w-3" /> Repo is private, only you can read it · token is encrypted (AES-256-GCM) · revoke anytime on GitHub.</p>
                </div>
                <Button onClick={() => setTab("cloud")} className="shrink-0 bg-emerald-600 text-xs text-white hover:bg-emerald-500">
                  Set up free backup <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </div>
        )}
        {ghLinked === true && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5 text-[11px] text-emerald-300">
            <Github className="h-3.5 w-3.5" /> Backed up: your memory auto-syncs to your private GitHub repo (free storage). <button onClick={() => setTab("cloud")} className="underline underline-offset-2 hover:text-emerald-200">Manage →</button>
          </div>
        )}

        {/* getting-started checklist — auto-hides when every step is done */}
        <OnboardingCard
          sessions={stats?.sessions ?? 0}
          memories={stats?.memories ?? 0}
          ghLinked={ghLinked}
          onGo={setTab}
        />

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="mb-5 flex h-auto w-full flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            <TabsTrigger value="connect" className={TAB_TRIGGER}>
              <Link2 className="mr-1 h-3.5 w-3.5" /> Connect
            </TabsTrigger>
            <TabsTrigger value="sessions" className={TAB_TRIGGER}>
              <MessageSquare className="mr-1 h-3.5 w-3.5" /> Sessions
            </TabsTrigger>
            <TabsTrigger value="memory" className={TAB_TRIGGER}>
              <Database className="mr-1 h-3.5 w-3.5" /> Memory
            </TabsTrigger>
            <TabsTrigger value="projects" className={TAB_TRIGGER}>
              <FolderKanban className="mr-1 h-3.5 w-3.5" /> Projects
            </TabsTrigger>
            <TabsTrigger value="meetings" className={TAB_TRIGGER}>
              <Video className="mr-1 h-3.5 w-3.5" /> Meetings
            </TabsTrigger>
            <TabsTrigger value="skills" className={TAB_TRIGGER}>
              <Zap className="mr-1 h-3.5 w-3.5" /> Skills
            </TabsTrigger>
            <TabsTrigger value="cloud" className={TAB_TRIGGER_CLOUD}>
              <Github className="mr-1 h-3.5 w-3.5" /> Cloud DB
            </TabsTrigger>
            <TabsTrigger value="stats" className={TAB_TRIGGER}>
              <Gauge className="mr-1 h-3.5 w-3.5" /> Stats
            </TabsTrigger>
          </TabsList>

          {/* ── CONNECT ── */}
          <TabsContent value="connect" className="space-y-5">
            {/* steps */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SETUP_STEPS.map((s, i) => (
                <div key={s.title} className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600/25 text-[10px] font-bold text-violet-300">{i + 1}</span>
                    <h3 className="text-sm font-semibold text-zinc-100">{s.title}</h3>
                  </div>
                  <p className="text-[11px] leading-relaxed text-zinc-400">{s.body}</p>
                </div>
              ))}
            </div>

            {/* endpoint */}
            <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/[0.07] to-transparent">
              <CardContent className="p-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                    <Terminal className="h-4 w-4 text-violet-400" /> MCP endpoint
                  </h3>
                  <CopyBtn text={endpoint} label="endpoint" />
                </div>
                <code className="block break-all rounded-lg border border-white/5 bg-black/40 px-3 py-2.5 font-mono text-xs text-emerald-300">
                  {endpoint}
                </code>
                <div className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-zinc-400">
                  <p><span className="font-semibold text-zinc-400">Auth header:</span> <code className="font-mono text-zinc-400">Authorization: Bearer {revealed ? token : token.slice(0, 7) + "…"}</code> — or append <code className="font-mono text-zinc-400">?token=…</code> if your client can&apos;t send headers.</p>
                  <p className="flex items-start gap-1.5"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> This token IS your memory space. Never paste it in public chats other than your own agent prompt.</p>
                </div>
              </CardContent>
            </Card>

            {/* magic prompt */}
            <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] to-transparent">
              <CardContent className="p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                      <BrainCircuit className="h-4 w-4 text-emerald-400" /> The Magic Prompt
                    </h3>
                    <p className="mt-0.5 text-[11px] text-zinc-400">Paste this into a new chat.z.ai agent-mode chat. Endpoint + key are already embedded.</p>
                  </div>
                  <div className="flex gap-2">
                    <CopyBtn text={magicPrompt} label="magic-prompt" />
                  </div>
                </div>
                <pre className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/50 p-4 font-mono text-[11px] leading-relaxed text-zinc-300 [scrollbar-color:rgb(113_113_122)_transparent] [scrollbar-width:thin]">
                  {magicPrompt}
                </pre>
              </CardContent>
            </Card>

            {/* mcp json */}
            <Card className="border-white/5 bg-white/[0.03]">
              <CardContent className="p-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                    <Terminal className="h-4 w-4 text-zinc-400" /> MCP client JSON config
                  </h3>
                  <CopyBtn text={mcpJson} label="mcp-json" small />
                </div>
                <pre className="overflow-x-auto rounded-lg border border-white/5 bg-black/40 p-4 font-mono text-[11px] leading-relaxed text-zinc-400">
                  {mcpJson}
                </pre>
                <p className="mt-2 text-[11px] text-zinc-500">For clients that accept an mcpServers JSON blob instead of URL + header fields.</p>
              </CardContent>
            </Card>

            {/* verify */}
            <Card className="border-white/5 bg-white/[0.03]">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Verify the pipe</h3>
                  <p className="mt-0.5 text-[11px] text-zinc-400">Run a one-shot JSON-RPC handshake against your MCP server (initialize → tools/list).</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    className="border-white/10 bg-white/5 text-xs text-zinc-300 hover:bg-white/10"
                    onClick={async () => {
                      try {
                        const res = await fetch(`${endpoint}?token=${encodeURIComponent(token)}`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Accept: "application/json" },
                          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "zaimem-dashboard", version: "1.0.0" } } }),
                        });
                        const data = await res.json();
                        if (data?.result?.serverInfo?.name === "zaimem") {
                          toast({ title: "MCP server healthy ✓", description: `${data.result.serverInfo.title} · protocol ${data.result.protocolVersion}` });
                        } else {
                          throw new Error("Unexpected response");
                        }
                      } catch (e) {
                        toast({ title: "Handshake failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
                      }
                    }}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Run handshake
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sessions">
            <SessionsPanel
              token={token}
              refreshToken={loadInfo}
              focusSessionId={focusSessionId}
              onFocusHandled={() => setFocusSessionId(null)}
            />
          </TabsContent>
          <TabsContent value="memory">
            <MemoryPanel token={token} refreshToken={loadInfo} />
          </TabsContent>
          <TabsContent value="projects">
            <ProjectsPanel token={token} refreshToken={loadInfo} />
          </TabsContent>
          <TabsContent value="meetings">
            <MeetingsPanel token={token} refreshToken={loadInfo} />
          </TabsContent>
          <TabsContent value="skills">
            <SkillsPanel token={token} refreshToken={loadInfo} />
          </TabsContent>
          <TabsContent value="cloud">
            <CloudDbPanel token={token} refreshToken={loadInfo} />
          </TabsContent>
          <TabsContent value="stats">
            <StatsPanel token={token} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="relative z-10 mt-auto border-t border-white/5 bg-black/30">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-zinc-500 sm:px-6">
          <span>ZaiMem v1.7 — 33 MCP tools · 8 togglable tool packs · vector memory · smart skills · session handoffs · project agent teams · meeting intelligence · web tools · HEADROOM compression · GitHub cloud DB · one-PAT account re-sync · scheduled backup · global search · document ingestion · pin & forget</span>
          <Badge variant="outline" className="border-white/10 text-[10px] text-zinc-400">token saver: auto-saved in this browser</Badge>
        </div>
      </footer>
    </div>
  );
}
