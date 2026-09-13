"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Github, CloudUpload, Link2, Loader2, ExternalLink, ShieldCheck,
  CheckCircle2, XCircle, RefreshCw, Unlink, KeyRound, History, Lock, CalendarClock,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fmtDate } from "./panels";

interface GhLink {
  login: string;
  patHint: string;
  repoName: string;
  repoFull: string;
  repoUrl: string;
  branch: string;
  autoSync: boolean;
  scheduleEnabled: boolean;
  lastScheduledAt: string | null;
  status: string;
  lastError: string | null;
  lastSyncAt: string | null;
  syncCount: number;
}

interface SyncLogEntry {
  id: string;
  action: string;
  status: string;
  files: number;
  detail: string | null;
  createdAt: string;
}

interface GhStatus {
  linked: boolean;
  link: GhLink | null;
  counts: { sessions: number; memories: number; skills: number; ledgerPages: number };
  logs: SyncLogEntry[];
}

async function call<T>(token: string, body?: Record<string, unknown>, method = "GET"): Promise<T> {
  const res = await fetch("/api/github", {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Request failed (${res.status})`);
  return data as T;
}

const ACTION_LABELS: Record<string, string> = {
  pair: "Paired",
  create_repo: "Repo created",
  push: "Push",
  force_sync: "Manual sync",
  unpair: "Unpaired",
  auto: "Auto sync",
  backup: "Scheduled backup",
  error: "Error",
};

// ─── not paired: pairing form ────────────────────────────────────────────────

function PairForm({ token, onPaired }: { token: string; onPaired: () => void }) {
  const [pat, setPat] = useState("");
  const [repoName, setRepoName] = useState("zaimem-cloud-db");
  const [busy, setBusy] = useState(false);

  async function pair() {
    if (pat.trim().length < 20) {
      toast({ title: "PAT looks too short", description: "Paste a GitHub Personal Access Token (starts with ghp_ / github_pat_).", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const r = await call<{ created: boolean; link: GhLink; sync: { pushed: number; totalFiles: number } }>(
        token, { action: "pair", pat: pat.trim(), repoName: repoName.trim() }, "POST",
      );
      toast({
        title: r.created ? "Private repo created ✓" : "Paired with existing repo ✓",
        description: `${r.link.repoFull} — initial sync pushed ${r.sync.pushed}/${r.sync.totalFiles} files.`,
      });
      setPat("");
      onPaired();
    } catch (e) {
      toast({ title: "Pairing failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card className="border-white/5 bg-white/[0.03]">
        <CardContent className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <KeyRound className="h-4 w-4 text-emerald-400" /> 1 · Create the PAT
          </h3>
          <ol className="mb-4 list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-zinc-400">
            <li>
              Open <a href="https://github.com/settings/tokens/new?scopes=repo&description=ZaiMem%20Cloud%20DB" target="_blank" rel="noreferrer" className="text-emerald-400 underline-offset-2 hover:underline">github.com → new token (classic)</a>
              {" "}— the <code className="font-mono text-zinc-400">repo</code> scope is pre-filled.
            </li>
            <li>Or a fine-grained token with <span className="text-zinc-400">Administration: read & write</span> + <span className="text-zinc-400">Contents: read & write</span> on <em>All repositories</em>.</li>
            <li>Generate, copy, paste it below. Expiration is up to you.</li>
          </ol>
          <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-3">
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-zinc-400">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              The PAT is encrypted (AES-256-GCM) before storage and is used only to create & push to your repo. ZaiMem never reads your other repositories. You can revoke it on GitHub at any time.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/5 bg-white/[0.03]">
        <CardContent className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Github className="h-4 w-4 text-zinc-300" /> 2 · Pair & auto-build your cloud DB
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-400" htmlFor="gh-pat">GitHub PAT</label>
              <Input
                id="gh-pat" type="password" value={pat} onChange={(e) => setPat(e.target.value)}
                placeholder="ghp_… or github_pat_…" autoComplete="off"
                className="h-10 border-white/10 bg-white/5 font-mono text-sm text-zinc-200 placeholder:text-zinc-500 focus-visible:ring-emerald-500/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-400" htmlFor="gh-repo">Private repo name</label>
              <Input
                id="gh-repo" value={repoName} onChange={(e) => setRepoName(e.target.value)}
                placeholder="zaimem-cloud-db"
                className="h-10 border-white/10 bg-white/5 font-mono text-sm text-zinc-200 placeholder:text-zinc-500 focus-visible:ring-emerald-500/50"
              />
              <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
                Created automatically if it doesn&apos;t exist. If the name is taken, ZaiMem reuses it only when it already is a ZaiMem cloud DB.
              </p>
            </div>
            <Button onClick={pair} disabled={busy} className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-500">
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />}
              {busy ? "Validating · creating repo · first sync…" : "Pair GitHub & build cloud DB"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── paired: status + log ────────────────────────────────────────────────────

function LinkedCard({ token, link, onUnpaired, onActivity }: { token: string; link: GhLink; onUnpaired: () => void; onActivity: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [autoSync, setAutoSync] = useState(link.autoSync);
  const [scheduleEnabled, setScheduleEnabled] = useState(link.scheduleEnabled);

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await call<{ sync: { pushed: number; unchanged: number; deleted: number; totalFiles: number } }>(token, { action: "sync" }, "POST");
      toast({ title: "Cloud DB synced ✓", description: `${r.sync.pushed} pushed · ${r.sync.unchanged} unchanged · ${r.sync.deleted} removed (${r.sync.totalFiles} files).` });
      onActivity();
    } catch (e) {
      toast({ title: "Sync failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  async function toggleAuto(v: boolean) {
    setAutoSync(v);
    try {
      await call(token, { action: "toggle", autoSync: v }, "POST");
      toast({ title: v ? "Auto-sync enabled" : "Auto-sync paused", description: v ? "Every change is mirrored to your repo (debounced)." : "Use 'Sync now' to push manually." });
    } catch {
      setAutoSync(!v);
      toast({ title: "Could not update auto-sync", variant: "destructive" });
    }
  }

  async function toggleSchedule(v: boolean) {
    setScheduleEnabled(v);
    try {
      await call(token, { action: "toggle_schedule", scheduleEnabled: v }, "POST");
      toast({ title: v ? "Scheduled backup enabled" : "Scheduled backup off", description: v ? "A full snapshot is pushed about once a day, even without changes." : "Your cloud DB is only updated on changes / manual sync." });
    } catch {
      setScheduleEnabled(!v);
      toast({ title: "Could not update scheduled backup", variant: "destructive" });
    }
  }

  async function unpair() {
    if (!confirm("Detach GitHub cloud DB? The private repo and its commit history stay in your GitHub account — nothing is deleted there.")) return;
    try {
      await call(token, { action: "unpair" }, "POST");
      toast({ title: "GitHub detached" });
      onUnpaired();
    } catch (e) {
      toast({ title: "Unpair failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  const statusBadge =
    link.status === "active" ? (
      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300"><CheckCircle2 className="mr-1 h-3 w-3" /> healthy</Badge>
    ) : link.status === "syncing" ? (
      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> syncing</Badge>
    ) : (
      <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-[10px] text-rose-300"><XCircle className="mr-1 h-3 w-3" /> error</Badge>
    );

  return (
    <div className="space-y-5">
      <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] to-transparent">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5">
                <Github className="h-5 w-5 text-zinc-200" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-zinc-100">{link.repoFull}</h3>
                  {statusBadge}
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {link.login} · branch <code className="font-mono text-zinc-400">{link.branch}</code> · PAT {link.patHint} · {link.syncCount} sync{link.syncCount === 1 ? "" : "s"}
                  {link.lastSyncAt && <> · last {fmtDate(link.lastSyncAt)}</>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href={link.repoUrl} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="h-8 border-white/10 bg-white/5 text-xs text-zinc-300 hover:bg-white/10">
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open repo
                </Button>
              </a>
              <Button size="sm" onClick={syncNow} disabled={syncing} className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-500">
                {syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                Sync now
              </Button>
              <Button size="sm" variant="ghost" onClick={unpair} className="h-8 text-xs text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300">
                <Unlink className="mr-1 h-3.5 w-3.5" /> Detach
              </Button>
            </div>
          </div>

          {link.lastError && (
            <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-rose-300">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {link.lastError}
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/30 p-3">
            <div className="flex items-start gap-2">
              <CloudUpload className="mt-0.5 h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-xs font-medium text-zinc-200">Auto-sync everything</p>
                <p className="text-[10px] leading-relaxed text-zinc-400">
                  Sessions, memories, vectors, ledger, skills & stats are mirrored ~4s after each change. Unchanged files are skipped (git blob sha compare).
                </p>
              </div>
            </div>
            <Switch checked={autoSync} onCheckedChange={toggleAuto} aria-label="Toggle auto-sync" />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/30 p-3">
            <div className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-xs font-medium text-zinc-200">Scheduled daily backup</p>
                <p className="text-[10px] leading-relaxed text-zinc-400">
                  Full snapshot pushed roughly every 24h even when nothing changed — a heartbeat that proves the repo backup is alive.
                  {link.lastScheduledAt && <> Last: <span className="text-zinc-400">{fmtDate(link.lastScheduledAt)}</span>.</>}
                </p>
              </div>
            </div>
            <Switch checked={scheduleEnabled} onCheckedChange={toggleSchedule} aria-label="Toggle scheduled backup" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SyncLogList({ logs }: { logs: SyncLogEntry[] }) {
  if (logs.length === 0) {
    return <p className="py-4 text-center text-xs text-zinc-500">No sync events yet.</p>;
  }
  return (
    <ScrollArea className="max-h-56 pr-2">
      <div className="space-y-1.5">
        {logs.map((l) => (
          <motion.div key={l.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
            {l.status === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />}
            <span className="shrink-0 text-xs font-medium text-zinc-300">{ACTION_LABELS[l.action] ?? l.action}</span>
            {l.files > 0 && <span className="shrink-0 text-[10px] text-emerald-400/80">{l.files} file{l.files === 1 ? "" : "s"}</span>}
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-500">{l.detail}</span>
            <span className="shrink-0 text-[10px] text-zinc-500">{fmtDate(l.createdAt)}</span>
          </motion.div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── panel root ──────────────────────────────────────────────────────────────

export function CloudDbPanel({ token, refreshToken }: { token: string; refreshToken: () => void }) {
  const [status, setStatus] = useState<GhStatus | null>(null);

  const load = useCallback(() => {
    call<GhStatus>(token)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [token]);

  useEffect(load, [load]);

  if (status === null) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;
  }

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-xs leading-relaxed text-zinc-400">
        Pair your GitHub PAT and ZaiMem <span className="text-zinc-300">auto-creates a private repo</span> in your account and mirrors
        <span className="text-zinc-300"> all your data</span> — sessions, vector memories, ledger pages, skills and token-saver stats — into it.
        Your repo becomes the cloud database you own: human-readable files, full commit history, exportable anytime.
      </p>

      {status.linked && status.link ? (
        <LinkedCard token={token} link={status.link} onUnpaired={load} onActivity={refreshToken} />
      ) : (
        <PairForm token={token} onPaired={load} />
      )}

      <Card className="border-white/5 bg-white/[0.03]">
        <CardContent className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <History className="h-4 w-4 text-zinc-400" /> Sync history
          </h3>
          <SyncLogList logs={status.logs} />
        </CardContent>
      </Card>

      {status.linked && (
        <p className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-500">
          <Lock className="h-3 w-3" /> Repo is private · only the paired PAT can read it · data paths managed by ZaiMem: /index.json /memories.json /vectors.jsonl /sessions /skills.json /stats.json /sync
        </p>
      )}
    </div>
  );
}
