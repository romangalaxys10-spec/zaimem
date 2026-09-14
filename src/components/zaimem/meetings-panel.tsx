"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Video, Loader2, Plus, ListChecks, Search, FileText, Users, CalendarClock, Check,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

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

interface MeetingListItem {
  source: string;
  title: string;
  platform: string | null;
  chunks: number;
  tokensEst: number;
  summary: string | null;
  actionItems: string[];
  lastAt: string;
}

export function MeetingsPanel({ token, refreshToken }: { token: string; refreshToken: () => void }) {
  const [meetings, setMeetings] = useState<MeetingListItem[] | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", platform: "", participants: "", transcript: "" });
  const [openMeeting, setOpenMeeting] = useState<MeetingListItem | null>(null);

  const load = async () => {
    try {
      const data = await api<{ meetings: MeetingListItem[] }>("/api/meetings", token);
      setMeetings(data.meetings);
    } catch {
      setMeetings([]);
    }
  };
  useEffect(() => { load(); }, []);

  async function onFilePicked(f: File | null) {
    if (!f) return;
    const text = await f.text();
    setForm((fm) => ({ ...fm, transcript: text, title: fm.title || f.name.replace(/\.[^.]+$/, "") }));
  }

  async function ingest() {
    if (!form.title.trim() || form.transcript.trim().length < 40) {
      toast({ title: "Title + transcript required", description: "Paste the full transcript (min 40 chars).", variant: "destructive" });
      return;
    }
    setIngesting(true);
    try {
      const data = await api<{ summary: string; actionItems: { who: string; what: string }[] }>("/api/meetings", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toast({
        title: "Meeting ingested",
        description: `${data.actionItems.length} action item(s) extracted and pushed to the tasks board.`,
      });
      setForm({ title: "", platform: "", participants: "", transcript: "" });
      setCreating(false);
      await load();
      refreshToken();
    } catch (e) {
      toast({ title: "Ingest failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setIngesting(false);
    }
  }

  if (meetings === null) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-sky-200">
          <Video className="h-4 w-4" /> Meeting intelligence — the Tactiq pattern, self-hosted
        </h3>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-300">
          Paste a Google Meet / Zoom / Teams transcript (or any recording text). ZaiMem stores the full transcript as searchable memory, writes a summary with every decision, extracts action items and pushes them onto the tasks board. Ask across all meetings from any agent with <code className="font-mono text-sky-300">zaimem_meeting_search</code>.
        </p>
      </div>

      {creating ? (
        <Card className="border-sky-500/25 bg-sky-500/[0.04]">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-zinc-100">Ingest a meeting</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Meeting title, e.g. 'Q3 roadmap sync'" className="h-9 w-64 border-white/10 bg-black/30 text-sm text-zinc-100 placeholder:text-zinc-600" />
              <Input value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))} placeholder="platform (meet/zoom/teams)" className="h-9 w-44 border-white/10 bg-black/30 text-xs text-zinc-100 placeholder:text-zinc-600" />
              <Input value={form.participants} onChange={(e) => setForm((f) => ({ ...f, participants: e.target.value }))} placeholder="participants (comma-separated)" className="h-9 w-56 border-white/10 bg-black/30 text-xs text-zinc-100 placeholder:text-zinc-600" />
            </div>
            <textarea
              value={form.transcript} onChange={(e) => setForm((f) => ({ ...f, transcript: e.target.value }))}
              placeholder="Paste the full transcript here…"
              rows={8}
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500/40"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={ingest} disabled={ingesting} className="h-9 bg-sky-600 text-xs text-white hover:bg-sky-500">
                {ingesting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                Ingest + summarize
              </Button>
              <label className="cursor-pointer text-[11px] text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline">
                or load a .txt/.vtt/.srt file…
                <input type="file" accept=".txt,.md,.vtt,.srt,.json" className="hidden" onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)} />
              </label>
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)} className="ml-auto h-9 text-xs text-zinc-400 hover:bg-white/5">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setCreating(true)} className="h-8 border-sky-500/30 bg-sky-500/10 text-xs text-sky-300 hover:bg-sky-500/20">
            <Plus className="mr-1 h-3.5 w-3.5" /> Ingest meeting
          </Button>
        </div>
      )}

      {meetings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Video className="h-10 w-10 text-zinc-500" />
          <p className="max-w-md text-sm text-zinc-400">No meetings yet. Ingest your first transcript — summary, decisions and action items are extracted automatically.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {meetings.map((m, i) => (
            <motion.div key={m.source} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}>
              <Card className="group cursor-pointer border-white/5 bg-white/[0.03] transition-colors hover:border-sky-500/25 hover:bg-white/[0.05]" onClick={() => setOpenMeeting(m)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-zinc-100 group-hover:text-sky-300">{m.title}</h3>
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{m.summary ?? "no summary"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {m.platform && <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-[10px] text-sky-300">{m.platform}</Badge>}
                      {m.actionItems.length > 0 && (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300">
                          <ListChecks className="mr-1 h-3 w-3" />{m.actionItems.length}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{m.chunks} chunks · ~{m.tokensEst.toLocaleString()} tok</span>
                    <span className="ml-auto flex items-center gap-1"><CalendarClock className="h-3 w-3" />{new Date(m.lastAt).toISOString().slice(0, 10)}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={!!openMeeting} onOpenChange={(o) => !o && setOpenMeeting(null)}>
        <DialogContent className="max-h-[85vh] border-white/10 bg-[#0d0d14] text-zinc-100 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <Video className="h-4 w-4 text-sky-400" /> {openMeeting?.title}
              {openMeeting?.platform && <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-[10px] text-sky-300">{openMeeting.platform}</Badge>}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {openMeeting?.chunks} transcript chunks · ~{openMeeting?.tokensEst.toLocaleString()} tokens stored · searchable from any agent
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            {openMeeting && (
              <div className="space-y-3 pb-2">
                {openMeeting.summary && (
                  <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] p-3">
                    <h4 className="mb-1 text-xs font-semibold text-sky-300">Summary</h4>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">{openMeeting.summary}</p>
                  </div>
                )}
                {openMeeting.actionItems.length > 0 && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3">
                    <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-300"><ListChecks className="h-3.5 w-3.5" /> Action items (also on the tasks board)</h4>
                    <ul className="space-y-1">
                      {openMeeting.actionItems.map((a, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-300"><Check className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="flex items-center gap-1.5 text-[11px] text-zinc-500"><Users className="h-3 w-3" /> Full transcript lives in vector memory — ask agents via zaimem_meeting_search or zaimem_doc_read {"{"}source: &quot;{openMeeting.source}&quot;{"}"}.</p>
                <div className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] p-2.5 text-[11px] text-zinc-400">
                  <Search className="h-3.5 w-3.5 text-violet-400" /> Try asking an agent: &quot;What did we decide in {openMeeting.title}?&quot;
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
