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
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  buildMagicPrompt, buildMcpJsonConfig, mcpEndpoint, SETUP_STEPS,
} from "./magic-prompt";
import {
  SessionsPanel, MemoryPanel, SkillsPanel, StatsPanel,
  type AuthInfo, fmtTokens,
} from "./panels";
import { CloudDbPanel } from "./cloud-db";
import { GlobalSearch, type SearchTarget } from "./search-bar";

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

export function Dashboard({ token, onLogout }: DashboardProps) {
  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState("connect");
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const magicPrompt = useMemo(() => buildMagicPrompt({ baseUrl, token }), [baseUrl, token]);
  const mcpJson = useMemo(() => buildMcpJsonConfig({ baseUrl, token }), [baseUrl, token]);
  const endpoint = useMemo(() => mcpEndpoint(baseUrl), [baseUrl]);

  const loadInfo = () => {
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setInfo)
      .catch(() => setInfo(null));
  };
  useEffect(loadInfo, []);

  // refresh counters when the user switches tabs (data changes via MCP outside the UI)
  useEffect(() => {
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setInfo(d))
      .catch(() => {});
  }, [tab, token]);

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

          {/* token chip */}
          <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-1 pl-2.5 pr-1">
            <KeyRound className="h-3.5 w-3.5 shrink-0 text-violet-400" />
            <code className="max-w-[140px] truncate font-mono text-xs text-zinc-300 sm:max-w-[220px]">
              {revealed ? token : token.slice(0, 7) + "••••••••••••" + token.slice(-4)}
            </code>
            <Button
              size="icon" variant="ghost" onClick={() => setRevealed((v) => !v)}
              className="h-6 w-6 text-zinc-500 hover:text-zinc-200" aria-label="Toggle token visibility"
            >
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="icon" variant="ghost" onClick={() => copy(token, "token")}
              className="h-6 w-6 text-zinc-500 hover:text-zinc-200" aria-label="Copy token"
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
                    <div className="mt-1 text-[11px] text-zinc-500">{s.label}</div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="mb-5 flex h-auto w-full flex-wrap gap-1 border border-white/5 bg-white/[0.03] p-1">
            <TabsTrigger value="connect" className="data-[state=active]:bg-violet-600/20 data-[state=active]:text-violet-200">
              <Link2 className="mr-1 h-3.5 w-3.5" /> Connect
            </TabsTrigger>
            <TabsTrigger value="sessions" className="data-[state=active]:bg-violet-600/20 data-[state=active]:text-violet-200">
              <MessageSquare className="mr-1 h-3.5 w-3.5" /> Sessions
            </TabsTrigger>
            <TabsTrigger value="memory" className="data-[state=active]:bg-violet-600/20 data-[state=active]:text-violet-200">
              <Database className="mr-1 h-3.5 w-3.5" /> Memory
            </TabsTrigger>
            <TabsTrigger value="skills" className="data-[state=active]:bg-violet-600/20 data-[state=active]:text-violet-200">
              <Zap className="mr-1 h-3.5 w-3.5" /> Skills
            </TabsTrigger>
            <TabsTrigger value="cloud" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-200">
              <Github className="mr-1 h-3.5 w-3.5" /> Cloud DB
            </TabsTrigger>
            <TabsTrigger value="stats" className="data-[state=active]:bg-violet-600/20 data-[state=active]:text-violet-200">
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
                  <p className="text-[11px] leading-relaxed text-zinc-500">{s.body}</p>
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
                <div className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-zinc-500">
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
                    <p className="mt-0.5 text-[11px] text-zinc-500">Paste this into a new chat.z.ai agent-mode chat. Endpoint + key are already embedded.</p>
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
                <p className="mt-2 text-[11px] text-zinc-600">For clients that accept an mcpServers JSON blob instead of URL + header fields.</p>
              </CardContent>
            </Card>

            {/* verify */}
            <Card className="border-white/5 bg-white/[0.03]">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Verify the pipe</h3>
                  <p className="mt-0.5 text-[11px] text-zinc-500">Run a one-shot JSON-RPC handshake against your MCP server (initialize → tools/list).</p>
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-zinc-600 sm:px-6">
          <span>ZaiMem v1.2 — local vector engine · smart-skill port · streamable-http MCP · GitHub cloud DB · scheduled backup · global search</span>
          <Badge variant="outline" className="border-white/10 text-[10px] text-zinc-500">token saver: auto-saved in this browser</Badge>
        </div>
      </footer>
    </div>
  );
}
