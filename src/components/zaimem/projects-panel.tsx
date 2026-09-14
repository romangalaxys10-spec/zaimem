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
  FolderKanban, Users, FileText, Database, Loader2, Plus, Trash2,
  ClipboardCopy, MessageSquare, Bot, UserPlus, CalendarClock,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { KindBadge, fmtDate, PromptModal } from "./panels";

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

interface ProjectFile { id: string; name: string; size: number; content?: string; updatedAt: string }
interface ProjectAgent { id: string; name: string; role: string | null; joinedVia: string; lastSeenAt: string }
interface ProjectMemory { id: string; kind: string; content: string; pinned: boolean; createdAt: string }
interface ProjectSession { id: string; title: string; turns: number; status: string; updatedAt: string }

interface ProjectListItem {
  id: string; name: string; description: string | null; instructions: string | null;
  files: number; agents: number; memories: number; sessions: number; updatedAt: string;
}

interface ProjectDetail {
  id: string; name: string; description: string | null; instructions: string | null; updatedAt: string;
  files: ProjectFile[]; agents: ProjectAgent[]; memories: ProjectMemory[]; sessions: ProjectSession[];
}

export function ProjectsPanel({ token, refreshToken }: { token: string; refreshToken: () => void }) {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  // create form
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", instructions: "" });
  // detail dialog editing helpers
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [fileForm, setFileForm] = useState<{ name: string; content: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [agentForm, setAgentForm] = useState<{ name: string; role: string } | null>(null);
  const [addingAgent, setAddingAgent] = useState(false);
  const [invitePrompt, setInvitePrompt] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await api<{ projects: ProjectListItem[] }>("/api/projects", token);
      setProjects(data.projects);
    } catch {
      setProjects([]);
    }
  };
  useEffect(() => { load(); }, []);

  const openDetail = async (id: string) => {
    try {
      const data = await api<{ project: ProjectDetail }>(`/api/projects/${id}`, token);
      setDetail(data.project);
      setInstructionsDraft(data.project.instructions ?? "");
    } catch (e) {
      toast({ title: "Failed to load project", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  async function createProject() {
    if (!form.name.trim()) {
      toast({ title: "Name required", description: "Give the project a name, e.g. 'acme-redesign'.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await api<{ project: { id: string } }>("/api/projects", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ name: "", description: "", instructions: "" });
      setCreating(false);
      toast({ title: "Project created", description: "Upload files/prompts and invite agents below." });
      await load();
      refreshToken();
    } catch (e) {
      toast({ title: "Create failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function saveInstructions() {
    if (!detail) return;
    setSavingInstructions(true);
    try {
      await api(`/api/projects/${detail.id}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: instructionsDraft }),
      });
      setDetail({ ...detail, instructions: instructionsDraft });
      toast({ title: "Instructions saved", description: "Every agent gets them in their next brief." });
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSavingInstructions(false);
    }
  }

  async function addFile() {
    if (!detail || !fileForm?.name.trim() || !fileForm?.content.trim()) {
      toast({ title: "Name and content required", variant: "destructive" });
      return;
    }
    setUploadingFile(true);
    try {
      await api(`/api/projects/${detail.id}/files`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fileForm),
      });
      setFileForm(null);
      toast({ title: "File attached", description: "Agents receive it in zaimem_project_brief." });
      await openDetail(detail.id);
      await load();
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setUploadingFile(false);
    }
  }

  async function onFilePicked(f: File | null) {
    if (!f) return;
    if (f.size > 150_000) {
      toast({ title: "File too large", description: "Text files up to 150 KB — paste content manually for bigger files.", variant: "destructive" });
      return;
    }
    const text = await f.text();
    setFileForm({ name: f.name, content: text });
  }

  async function removeFile(fileId: string) {
    if (!detail) return;
    try {
      await api(`/api/projects/${detail.id}/files?fileId=${fileId}`, token, { method: "DELETE" });
      await openDetail(detail.id);
      await load();
    } catch (e) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  async function addAgent() {
    if (!detail || !agentForm?.name.trim()) return;
    setAddingAgent(true);
    try {
      await api(`/api/projects/${detail.id}/agents`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentForm),
      });
      setAgentForm(null);
      toast({ title: "Agent added to roster" });
      await openDetail(detail.id);
      await load();
    } catch (e) {
      toast({ title: "Add failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setAddingAgent(false);
    }
  }

  async function removeAgent(agentId: string) {
    if (!detail) return;
    try {
      await api(`/api/projects/${detail.id}/agents?agentId=${agentId}`, token, { method: "DELETE" });
      await openDetail(detail.id);
      await load();
    } catch (e) {
      toast({ title: "Remove failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  async function getInvite() {
    if (!detail) return;
    setInvitePrompt(null);
    try {
      const data = await api<{ prompt: string }>(`/api/projects/${detail.id}/prompt`, token);
      setInvitePrompt(data.prompt);
    } catch (e) {
      toast({ title: "Prompt generation failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  async function removeProject(id: string) {
    try {
      await api(`/api/projects/${id}`, token, { method: "DELETE" });
      setDetail(null);
      setProjects((p) => p?.filter((x) => x.id !== id) ?? null);
      toast({ title: "Project deleted", description: "Shared memories keep their project tags in Memory." });
      refreshToken();
    } catch (e) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  if (projects === null) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* explainer */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-200">
          <Users className="h-4 w-4" /> Agent teams — how it works
        </h3>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-[11px] leading-relaxed text-zinc-300">
          <li>Create a project: name, description, team instructions.</li>
          <li>Attach instructions / files / prompts — every agent reads them when joining.</li>
          <li>Invite agents: copy the invite prompt into a fresh agent chat in any IDE, or add them manually. Agents join via <code className="font-mono text-amber-300">zaimem_project_brief</code>.</li>
          <li>The team shares one project memory namespace: decisions, handoffs and files — like a team of devs with a shared brain.</li>
        </ol>
      </div>

      {/* create */}
      {creating ? (
        <Card className="border-violet-500/25 bg-violet-500/[0.04]">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-zinc-100">New project</h3>
            </div>
            <Input
              value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Project name / namespace, e.g. 'acme-redesign'" className="border-white/10 bg-black/30 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
            <Input
              value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="One-line description (optional)" className="border-white/10 bg-black/30 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
            <textarea
              value={form.instructions} onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              placeholder="Team instructions: goals, conventions, coding standards, how agents should divide work…"
              rows={4}
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500/40"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={createProject} disabled={busy} className="h-9 bg-violet-600 text-xs text-white hover:bg-violet-500">
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />} Create project
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)} className="h-9 text-xs text-zinc-400 hover:bg-white/5">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setCreating(true)} className="h-8 border-violet-500/30 bg-violet-500/10 text-xs text-violet-300 hover:bg-violet-500/20">
            <Plus className="mr-1 h-3.5 w-3.5" /> New project
          </Button>
        </div>
      )}

      {/* list */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FolderKanban className="h-10 w-10 text-zinc-500" />
          <p className="max-w-md text-sm text-zinc-400">No projects yet. Create one, attach instructions + files, and connect agents — they work together like a team of devs with a shared memory.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}>
              <Card className="group cursor-pointer border-white/5 bg-white/[0.03] transition-colors hover:border-violet-500/25 hover:bg-white/[0.05]" onClick={() => openDetail(p.id)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-zinc-100 group-hover:text-violet-300">{p.name}</h3>
                      <p className="mt-0.5 line-clamp-1 text-xs text-zinc-400">{p.description ?? "no description"}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 border-violet-500/30 bg-violet-500/10 text-[10px] text-violet-300">
                      <Users className="mr-1 h-3 w-3" />{p.agents} agent{p.agents === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{p.files} files</span>
                    <span className="flex items-center gap-1"><Database className="h-3 w-3" />{p.memories} shared memories</span>
                    <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{p.sessions} sessions</span>
                    <span className="ml-auto flex items-center gap-1"><CalendarClock className="h-3 w-3" />{fmtDate(p.updatedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] border-white/10 bg-[#0d0d14] text-zinc-100 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <FolderKanban className="h-4 w-4 text-violet-400" /> {detail?.name}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {detail?.description ?? "project workspace"} · {detail?.files.length} files · {detail?.agents.length} agents · {detail?.memories.length} shared memories
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            {detail && (
              <div className="space-y-4">
                {/* instructions */}
                <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.04] p-3">
                  <h4 className="mb-2 flex items-center justify-between text-xs font-semibold text-violet-300">
                    <span>Team instructions (given to every agent)</span>
                    <Button size="sm" variant="outline" onClick={saveInstructions} disabled={savingInstructions} className="h-6 border-violet-500/30 bg-violet-500/10 px-2 text-[10px] text-violet-300 hover:bg-violet-500/20">
                      {savingInstructions ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                  </h4>
                  <textarea
                    value={instructionsDraft}
                    onChange={(e) => setInstructionsDraft(e.target.value)}
                    rows={4}
                    placeholder="Goals, conventions, coding standards, how agents should divide work…"
                    className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500/40"
                  />
                </div>

                {/* invite CTA */}
                <Button onClick={getInvite} className="w-full bg-emerald-600 text-xs text-white hover:bg-emerald-500">
                  <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" /> Copy agent invite prompt (paste into any fresh agent chat)
                </Button>

                {/* agents */}
                <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-200"><Bot className="h-3.5 w-3.5 text-sky-400" /> Team roster</h4>
                  <div className="space-y-1.5">
                    {detail.agents.length === 0 && <p className="text-[11px] text-zinc-500">No agents connected yet — invite one above or add manually.</p>}
                    {detail.agents.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-md border border-white/5 bg-black/20 px-2.5 py-1.5">
                        <span className="font-mono text-xs text-sky-300">{a.name}</span>
                        {a.role && <span className="text-[10px] text-zinc-500">{a.role}</span>}
                        <Badge variant="outline" className={`ml-auto text-[9px] ${a.joinedVia === "mcp" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-zinc-400"}`}>
                          {a.joinedVia === "mcp" ? "joined via MCP" : "manual"}
                        </Badge>
                        <span className="text-[10px] text-zinc-500">{fmtDate(a.lastSeenAt)}</span>
                        <button onClick={() => removeAgent(a.id)} className="text-zinc-500 hover:text-rose-400" aria-label="Remove agent"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                  {agentForm ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Input value={agentForm.name} onChange={(e) => setAgentForm((f) => f && { ...f, name: e.target.value })} placeholder="agent name, e.g. 'frontend-dev'" className="h-8 w-40 border-white/10 bg-black/30 text-xs text-zinc-100" />
                      <Input value={agentForm.role} onChange={(e) => setAgentForm((f) => f && { ...f, role: e.target.value })} placeholder="role (optional)" className="h-8 w-36 border-white/10 bg-black/30 text-xs text-zinc-100" />
                      <Button size="sm" onClick={addAgent} disabled={addingAgent} className="h-8 bg-sky-600 text-xs text-white hover:bg-sky-500"><UserPlus className="mr-1 h-3 w-3" /> Add</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAgentForm(null)} className="h-8 text-xs text-zinc-400">Cancel</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setAgentForm({ name: "", role: "" })} className="mt-2 h-7 text-[11px] text-zinc-400 hover:bg-white/5"><UserPlus className="mr-1 h-3 w-3" /> Add agent manually</Button>
                  )}
                </div>

                {/* files */}
                <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-200"><FileText className="h-3.5 w-3.5 text-lime-400" /> Files / prompts attached</h4>
                  <div className="space-y-1.5">
                    {detail.files.length === 0 && <p className="text-[11px] text-zinc-500">Nothing attached yet — add specs, prompts, conventions.</p>}
                    {detail.files.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 rounded-md border border-white/5 bg-black/20 px-2.5 py-1.5">
                        <FileText className="h-3 w-3 shrink-0 text-lime-400" />
                        <span className="truncate font-mono text-xs text-zinc-200">{f.name}</span>
                        <span className="ml-auto text-[10px] text-zinc-500">{f.size.toLocaleString()} chars</span>
                        <button onClick={() => removeFile(f.id)} className="text-zinc-500 hover:text-rose-400" aria-label="Delete file"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                  {fileForm ? (
                    <div className="mt-2 space-y-2">
                      <Input value={fileForm.name} onChange={(e) => setFileForm((f) => f && { ...f, name: e.target.value })} placeholder="file name, e.g. spec.md" className="h-8 border-white/10 bg-black/30 text-xs text-zinc-100" />
                      <textarea
                        value={fileForm.content} onChange={(e) => setFileForm((f) => f && { ...f, content: e.target.value })}
                        placeholder="paste content…" rows={4}
                        className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600"
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={addFile} disabled={uploadingFile} className="h-8 bg-lime-600 text-xs text-white hover:bg-lime-500">
                          {uploadingFile ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />} Attach
                        </Button>
                        <label className="cursor-pointer text-[11px] text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline">
                          or pick a text file…
                          <input type="file" className="hidden" onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)} />
                        </label>
                        <Button size="sm" variant="ghost" onClick={() => setFileForm(null)} className="ml-auto h-8 text-xs text-zinc-400">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setFileForm({ name: "", content: "" })} className="mt-2 h-7 text-[11px] text-zinc-400 hover:bg-white/5"><Plus className="mr-1 h-3 w-3" /> Attach file / prompt</Button>
                  )}
                </div>

                {/* sessions */}
                {detail.sessions.length > 0 && (
                  <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-200"><MessageSquare className="h-3.5 w-3.5 text-violet-400" /> Sessions on this project</h4>
                    <div className="space-y-1">
                      {detail.sessions.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 text-[11px] text-zinc-300">
                          <span className="truncate">{s.title}</span>
                          <span className="ml-auto text-zinc-500">{s.turns} turns · {fmtDate(s.updatedAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* shared memories */}
                <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-200"><Database className="h-3.5 w-3.5 text-emerald-400" /> Shared team memory</h4>
                  <div className="space-y-2">
                    {detail.memories.length === 0 && <p className="text-[11px] text-zinc-500">Nothing shared yet — teammates store memories tagged with this project.</p>}
                    {detail.memories.slice(0, 12).map((m) => (
                      <div key={m.id} className="rounded-md border border-white/5 bg-black/20 p-2.5">
                        <div className="mb-1 flex items-center gap-2"><KindBadge kind={m.kind} />{m.pinned && <span className="text-[10px] text-amber-400">pinned</span>}</div>
                        <p className="text-[11px] leading-relaxed text-zinc-300">{m.content.slice(0, 300)}{m.content.length > 300 ? "…" : ""}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between pb-2">
                  <Button size="sm" variant="ghost" onClick={() => removeProject(detail.id)} className="h-7 text-[11px] text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="mr-1 h-3 w-3" /> Delete project</Button>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <PromptModal
        open={!!invitePrompt}
        title="Agent invite prompt"
        hint="Paste into a fresh agent chat in any MCP-capable IDE (Claude Code, Cursor, Cline, Windsurf, Trae, Antigravity, zcode, chat.z.ai…) — the agent joins this project team with the full brief."
        prompt={invitePrompt}
        onClose={() => setInvitePrompt(null)}
      />
    </div>
  );
}
