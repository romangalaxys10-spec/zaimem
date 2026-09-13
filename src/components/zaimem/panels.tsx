"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  MessageSquare, Database, Gauge, Zap, Search, Trash2, Loader2,
  FileText, Layers, Clock, TrendingUp, Activity, Download, Upload,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

// ─── shared types ────────────────────────────────────────────────────────────

export interface SessionSummary {
  id: string;
  title: string;
  topic: string | null;
  status: string;
  summary: string | null;
  externalId: string | null;
  turns: number;
  tokensSaved: number;
  memories: number;
  ledgerPages: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDetail extends SessionSummary {
  memories: { id: string; kind: string; content: string; importance: number; accessCount: number; createdAt: string }[];
  ledgerPages: { id: string; path: string; content: string; updatedAt: string }[];
}

export interface MemoryItem {
  id: string;
  kind: string;
  content: string;
  keywords?: string | null;
  importance?: number;
  accessCount: number;
  sessionId: string | null;
  createdAt: string;
  updatedAt?: string;
  score?: number;
}

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  source: string;
  enabled: boolean;
  bodyPreview: string;
  updatedAt: string;
}

export interface StatsData {
  totals: { events: number; tokensSaved: number; tokensIn: number; tokensOut: number };
  byAction: { action: string; events: number; tokensSaved: number }[];
  dailySaved: { day: string; saved: number }[];
  recent: { id: string; action: string; tokensSaved: number; detail: string | null; createdAt: string }[];
}

export interface AuthInfo {
  counts: { sessions: number; memories: number; skills: number; ledgerPages: number; tokensSaved: number };
}

export const KIND_COLORS: Record<string, string> = {
  fact: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  decision: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  preference: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  reflection: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  workflow: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  summary: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export function KindBadge({ kind }: { kind: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium ${KIND_COLORS[kind] ?? "bg-zinc-500/15 text-zinc-300 border-zinc-500/30"}`}>
      {kind}
    </Badge>
  );
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ─── Sessions panel ──────────────────────────────────────────────────────────

export function SessionsPanel({ token, refreshToken }: { token: string; refreshToken: () => void }) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = async () => {
    try {
      const data = await api<{ sessions: SessionSummary[] }>("/api/sessions", token);
      setSessions(data.sessions);
    } catch {
      setSessions([]);
    }
  };
  // load once on mount
  useEffect(() => { load(); }, []);

  async function openDetail(id: string) {
    setLoadingDetail(true);
    try {
      const data = await api<{ session: SessionDetail }>(`/api/sessions/${id}`, token);
      setDetail(data.session);
    } catch (e) {
      toast({ title: "Failed to load session", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoadingDetail(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/sessions/${id}`, token, { method: "DELETE" });
      setSessions((s) => s?.filter((x) => x.id !== id) ?? null);
      setDetail(null);
      toast({ title: "Session forgotten" });
      refreshToken();
    } catch (e) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  if (sessions === null) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;
  }
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <MessageSquare className="h-10 w-10 text-zinc-600" />
        <p className="text-sm text-zinc-400">No synced sessions yet. Paste the magic prompt into chat.z.ai agent mode — sessions appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {sessions.map((s, i) => (
        <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}>
          <Card className="group border-white/5 bg-white/[0.03] transition-colors hover:border-violet-500/25 hover:bg-white/[0.05]">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => openDetail(s.id)} className="min-w-0 flex-1 text-left">
                  <h3 className="truncate font-semibold text-zinc-100 group-hover:text-violet-300">{s.title}</h3>
                  <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{s.topic ?? "no topic recorded"}</p>
                </button>
                <Badge variant="outline" className={`shrink-0 text-[10px] ${s.status === "summarized" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-violet-500/30 bg-violet-500/10 text-violet-300"}`}>
                  {s.status}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1"><Database className="h-3 w-3" />{s.memories} memories</span>
                <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{s.turns} turns</span>
                {s.tokensSaved > 0 && <span className="flex items-center gap-1 text-amber-400/90"><Gauge className="h-3 w-3" />{fmtTokens(s.tokensSaved)} saved</span>}
                {s.ledgerPages > 0 && <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{s.ledgerPages} ledger</span>}
                <span className="ml-auto flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(s.updatedAt)}</span>
              </div>
              <div className="mt-3 flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                <Button size="sm" variant="outline" onClick={() => openDetail(s.id)} className="h-7 border-white/10 bg-white/5 text-xs text-zinc-300 hover:bg-white/10">Inspect</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(s.id)} className="h-7 text-xs text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300">Forget</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] border-white/10 bg-[#0d0d14] text-zinc-100 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <span className="truncate">{detail?.title}</span>
              {detail && <KindBadge kind={detail.status === "summarized" ? "summary" : "fact"} />}
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              {detail?.topic} · {detail?.memories.length} memories · {detail?.ledgerPages.length} ledger pages
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[55vh] pr-3">
            {detail?.summary && (
              <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-300"><Layers className="h-3.5 w-3.5" /> Session digest</h4>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">{detail.summary}</p>
              </div>
            )}
            <div className="space-y-2">
              {detail?.memories.map((m) => (
                <div key={m.id} className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <KindBadge kind={m.kind} />
                    <span className="text-[10px] text-zinc-600">×{m.accessCount} recalls</span>
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-300">{m.content}</p>
                </div>
              ))}
              {detail?.ledgerPages.map((p) => (
                <div key={p.id} className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-3">
                  <h4 className="mb-1 font-mono text-xs font-semibold text-fuchsia-300">{p.path}</h4>
                  <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-400">{p.content.slice(0, 1200)}</pre>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Memory panel ────────────────────────────────────────────────────────────

export function MemoryPanel({ token, refreshToken }: { token: string; refreshToken: () => void }) {
  const [query, setQuery] = useState("");
  const [memories, setMemories] = useState<MemoryItem[] | null>(null);
  const [mode, setMode] = useState<string>("recent");
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadRecent = async () => {
    try {
      const data = await api<{ memories: MemoryItem[]; mode: string }>("/api/memories?limit=40", token);
      setMemories(data.memories);
      setMode(data.mode);
    } catch {
      setMemories([]);
    }
  };
  useEffect(() => { loadRecent(); }, []);

  async function search() {
    if (!query.trim()) return loadRecent();
    setSearching(true);
    try {
      const data = await api<{ memories: MemoryItem[]; mode: string }>(
        `/api/memories?q=${encodeURIComponent(query.trim())}&limit=25`, token,
      );
      setMemories(data.memories);
      setMode(data.mode);
    } catch (e) {
      toast({ title: "Search failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/memories/${id}`, token, { method: "DELETE" });
      setMemories((m) => m?.filter((x) => x.id !== id) ?? null);
      toast({ title: "Memory deleted" });
      refreshToken();
    } catch (e) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  async function exportMemories() {
    try {
      const res = await fetch("/api/memories/export", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zaimem-memories-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Memories exported", description: "Portable JSON downloaded — re-importable on any ZaiMem account." });
    } catch (e) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  async function importMemories(file: File) {
    setImporting(true);
    try {
      const parsed = JSON.parse(await file.text());
      const items = Array.isArray(parsed) ? parsed : parsed?.memories;
      if (!Array.isArray(items) || items.length === 0) throw new Error("No memories found — expected a ZaiMem export file");
      const res = await api<{ total: number; imported: number; merged: number; deduped: number; skipped: number }>(
        "/api/memories/import", token,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memories: items }) },
      );
      const parts = [`${res.imported} imported`];
      if (res.merged) parts.push(`${res.merged} merged`);
      if (res.deduped) parts.push(`${res.deduped} duplicates skipped`);
      if (res.skipped) parts.push(`${res.skipped} invalid`);
      toast({ title: "Import complete", description: parts.join(" · ") });
      await loadRecent();
      refreshToken();
    } catch (e) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : "Invalid JSON file", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Semantic vector search across all sessions…"
            className="h-10 border-white/10 bg-white/5 pl-9 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-violet-500/50"
          />
        </div>
        <Button onClick={search} disabled={searching} className="h-10 bg-violet-600 text-white hover:bg-violet-500">
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-zinc-600">
          {mode === "vector_search" ? "cosine-similarity ranked · recency + keyword boosts applied" : "most recently updated memories"}
        </p>
        <div className="flex shrink-0 gap-1.5">
          <Button
            size="sm" variant="outline" onClick={exportMemories}
            className="h-7 border-white/10 bg-white/5 px-2.5 text-[11px] text-zinc-300 hover:bg-white/10"
          >
            <Download className="mr-1 h-3 w-3" /> Export
          </Button>
          <Button
            size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}
            className="h-7 border-white/10 bg-white/5 px-2.5 text-[11px] text-zinc-300 hover:bg-white/10"
          >
            {importing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />} Import
          </Button>
          <input
            ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importMemories(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {memories === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>
      ) : memories.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Database className="h-10 w-10 text-zinc-600" />
          <p className="text-sm text-zinc-400">{mode === "vector_search" ? "Nothing above the relevance threshold for this query." : "Memory space is empty. It fills up automatically as you chat with the enhanced agent."}</p>
        </div>
      ) : (
        <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1 [scrollbar-color:rgb(113_113_122)_transparent] [scrollbar-width:thin]">
          {memories.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="group flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.03] p-3 transition-colors hover:border-white/10"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <KindBadge kind={m.kind} />
                  {m.score !== undefined && <span className="text-[10px] text-emerald-400/80">score {m.score.toFixed(3)}</span>}
                  {m.keywords && <span className="hidden font-mono text-[10px] text-zinc-600 sm:inline">{m.keywords.split(",").slice(0, 4).join(" · ")}</span>}
                </div>
                <p className="text-xs leading-relaxed text-zinc-300">{m.content}</p>
              </div>
              <Button
                size="icon" variant="ghost"
                onClick={() => remove(m.id)}
                className="h-7 w-7 shrink-0 text-zinc-600 opacity-0 transition-opacity hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
                aria-label="Delete memory"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Skills panel ────────────────────────────────────────────────────────────

export function SkillsPanel({ token, refreshToken }: { token: string; refreshToken: () => void }) {
  const [skills, setSkills] = useState<SkillItem[] | null>(null);

  useEffect(() => {
    api<{ skills: SkillItem[] }>("/api/skills", token)
      .then((d) => setSkills(d.skills))
      .catch(() => setSkills([]));
  }, []);

  async function toggle(id: string, enabled: boolean) {
    try {
      await api("/api/skills", token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      setSkills((s) => s?.map((x) => (x.id === id ? { ...x, enabled } : x)) ?? null);
      toast({ title: enabled ? "Skill enabled" : "Skill disabled" });
      refreshToken();
    } catch (e) {
      toast({ title: "Update failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  if (skills === null) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-zinc-500">
        The skill registry follows the <span className="font-mono text-zinc-400">SKILL.md</span> convention ported from{" "}
        <a href="https://github.com/romangalaxys10-spec/zcode-smart-skill" target="_blank" rel="noreferrer" className="text-violet-400 underline-offset-2 hover:underline">zcode-smart-skill</a>.
        The agent auto-triggers these via <span className="font-mono text-zinc-400">zaimem_detect_skill</span> — trigger phrases live inside each description.
      </p>
      {skills.map((s) => (
        <Card key={s.id} className={`border-white/5 transition-colors ${s.enabled ? "bg-white/[0.03]" : "bg-white/[0.01] opacity-60"}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-mono font-semibold text-zinc-100">{s.name}</h3>
                  <Badge variant="outline" className={`text-[10px] ${s.source === "builtin" ? "border-violet-500/30 bg-violet-500/10 text-violet-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
                    {s.source}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{s.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.triggers.slice(0, 8).map((t) => (
                    <span key={t} className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">&quot;{t}&quot;</span>
                  ))}
                  {s.triggers.length > 8 && <span className="text-[10px] text-zinc-600">+{s.triggers.length - 8} more</span>}
                </div>
              </div>
              <Switch checked={s.enabled} onCheckedChange={(v) => toggle(s.id, v)} aria-label={`Toggle ${s.name}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Stats panel ─────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  save_tokens: "Token saver runs",
  remember: "Memories stored",
  recall: "Memory recalls",
  enhance: "Context enhancements",
  sync_session: "Session syncs",
  detect_skill: "Skill detections",
  summary: "Session summaries",
  import: "Memories imported",
};

export function StatsPanel({ token }: { token: string }) {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    api<StatsData>("/api/stats", token).then(setStats).catch(() => setStats(null));
  }, [token]);

  if (!stats) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;
  }

  const maxDaily = Math.max(1, ...stats.dailySaved.map((d) => d.saved));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-transparent">
          <CardContent className="p-5 text-center">
            <Gauge className="mx-auto mb-2 h-5 w-5 text-amber-400" />
            <div className="text-3xl font-extrabold text-amber-300">{fmtTokens(stats.totals.tokensSaved)}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-zinc-500">tokens saved</div>
          </CardContent>
        </Card>
        <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-transparent">
          <CardContent className="p-5 text-center">
            <Activity className="mx-auto mb-2 h-5 w-5 text-violet-400" />
            <div className="text-3xl font-extrabold text-violet-300">{stats.totals.events}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-zinc-500">enhancer events</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent">
          <CardContent className="p-5 text-center">
            <TrendingUp className="mx-auto mb-2 h-5 w-5 text-emerald-400" />
            <div className="text-3xl font-extrabold text-emerald-300">{fmtTokens(stats.totals.tokensOut)}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-zinc-500">tokens returned (compressed)</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="border-white/5 bg-white/[0.03]">
          <CardContent className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-zinc-200">Saved tokens · last 7 days</h3>
            <div className="flex h-32 items-end gap-2">
              {stats.dailySaved.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-amber-600/60 to-amber-400/80 transition-all"
                    style={{ height: `${Math.max(3, (d.saved / maxDaily) * 100)}%` }}
                    title={`${d.saved} tokens`}
                  />
                  <span className="text-[9px] text-zinc-600">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-white/[0.03]">
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-zinc-200">By action</h3>
            <div className="space-y-2">
              {stats.byAction.length === 0 && <p className="text-xs text-zinc-500">No activity yet — connect an agent and start chatting.</p>}
              {stats.byAction.map((a) => (
                <div key={a.action} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="text-xs text-zinc-300">{ACTION_LABELS[a.action] ?? a.action}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-zinc-100">{a.events}</span>
                    {a.tokensSaved > 0 && <span className="text-[10px] text-amber-400">−{fmtTokens(a.tokensSaved)}</span>}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/5 bg-white/[0.03]">
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-zinc-200">Recent activity</h3>
          <div className="space-y-1.5">
            {stats.recent.length === 0 && <p className="text-xs text-zinc-500">Nothing yet.</p>}
            {stats.recent.map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-[11px]">
                <Zap className="h-3 w-3 shrink-0 text-violet-500" />
                <span className="text-zinc-300">{ACTION_LABELS[r.action] ?? r.action}</span>
                {r.tokensSaved > 0 && <span className="text-amber-400">saved {fmtTokens(r.tokensSaved)}</span>}
                <span className="ml-auto shrink-0 text-zinc-600">{fmtDate(r.createdAt)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
