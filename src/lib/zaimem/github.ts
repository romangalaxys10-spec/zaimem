/**
 * ZaiMem GitHub Cloud DB
 * ─────────────────────────────────────────────────────────────────────────────
 * Each logged-in user can pair a GitHub PAT. ZaiMem then:
 *   1. validates the PAT  (GET /user)
 *   2. AUTO-CREATES a private repo in the user's account (or reuses the
 *      existing ZaiMem one), e.g. `zaimem-cloud-db`
 *   3. AUTO-SYNCS ALL data — sessions, memories, vectors, skills, ledger
 *      pages, usage stats — into the repo as human-readable files,
 *      effectively using the private repo as the user's cloud database.
 *
 * Sync strategy:
 *   • snapshot builder produces { path → content } files
 *   • one `git trees?recursive=1` call maps remote blobs → sha
 *   • only files whose git-blob-sha changed are pushed (contents API)
 *   • managed paths deleted remotely from the repo when data was deleted
 *     locally; user's own extra files in the repo are never touched
 *   • auto-sync is debounced (4s) and coalesced per user, fire-and-forget
 *   • per-user in-flight mutex prevents concurrent sync races
 */

import { db } from "@/lib/db";
import { decryptSecretUpgradable, encryptSecret, secretHint, computeBlobSha } from "./crypto";

/**
 * Load a stored PAT, transparently re-encrypting payloads written under the
 * legacy public key (pre-1.7.2) with the current ZAIMEM_SECRET-derived key.
 */
async function loadPat(link: { userId: string; patEnc: string }): Promise<string> {
  const { plain, upgraded } = decryptSecretUpgradable(link.patEnc);
  if (upgraded) {
    await db.githubLink
      .update({ where: { userId: link.userId }, data: { patEnc: encryptSecret(plain) } })
      .catch(() => {});
  }
  return plain;
}

// ─── low-level GitHub client ─────────────────────────────────────────────────

function apiBase(): string {
  // overridable for tests (e2e mock server)
  return process.env.GITHUB_API_BASE || "https://api.github.com";
}

export class GhError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function gh(pat: string, path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(apiBase() + path, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${pat}`,
        "User-Agent": "ZaiMem-CloudDB",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new GhError(0, `GitHub unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
  return res;
}

async function ghJson<T>(pat: string, path: string, init?: RequestInit): Promise<{ status: number; data: T; headers: Headers }> {
  const res = await gh(pat, path, init);
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const msg =
      (data as { message?: string } | null)?.message ??
      `GitHub API ${res.status}`;
    throw new GhError(res.status, msg);
  }
  return { status: res.status, data: data as T, headers: res.headers };
}

// ─── PAT validation & repo provisioning ──────────────────────────────────────

export async function validatePat(pat: string): Promise<{ login: string }> {
  if (!pat || pat.length < 20) throw new GhError(400, "That does not look like a GitHub PAT (too short).");
  const { data } = await ghJson<{ login: string }>(pat, "/user");
  if (!data?.login) throw new GhError(401, "GitHub rejected this PAT.");
  return { login: data.login };
}

const REPO_DESCRIPTION = "ZaiMem Cloud DB — auto-synced session memory, vector store & skills (managed by ZaiMem)";

export interface RepoInfo {
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  created: boolean;
}

async function tryGetRepo(pat: string, full: string): Promise<{ fullName: string; htmlUrl: string; defaultBranch: string } | null> {
  try {
    const { data } = await ghJson<{ full_name: string; html_url: string; default_branch: string; private: boolean; description: string | null }>(
      pat, `/repos/${full}`,
    );
    if (!data?.full_name) return null;
    // only reuse repos we manage (or empty ones) — never commandeer a foreign project
    if (data.private === false) return null;
    if (data.description && !data.description.includes("ZaiMem")) return null;
    return { fullName: data.full_name, htmlUrl: data.html_url, defaultBranch: data.default_branch || "main" };
  } catch {
    return null;
  }
}

export async function ensurePrivateRepo(pat: string, login: string, preferredName = "zaimem-cloud-db"): Promise<RepoInfo> {
  const cleanName = (preferredName || "zaimem-cloud-db").trim().replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "zaimem-cloud-db";
  const candidates = [cleanName];
  if (cleanName !== "zaimem-cloud-db") candidates.push("zaimem-cloud-db");

  // reuse an existing managed repo first
  for (const name of candidates) {
    const existing = await tryGetRepo(pat, `${login}/${name}`);
    if (existing) return { ...existing, created: false };
  }

  // create a fresh private repo
  for (const name of candidates) {
    const res = await ghJson<{ full_name: string; html_url: string; default_branch: string }>(pat, "/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name,
        description: REPO_DESCRIPTION,
        private: true,
        auto_init: true,
        gitignore_template: "Git",
      }),
    }).catch((e) => (e instanceof GhError ? e : new GhError(500, String(e))));

    if (res instanceof GhError) {
      if (res.status === 422) continue; // name taken → next candidate
      if (res.status === 403 || res.status === 404) {
        throw new GhError(403, "PAT lacks permission to create repositories. Classic PAT: enable the 'repo' scope. Fine-grained PAT: grant 'Administration: read & write' + 'Contents: read & write' on All repositories.");
      }
      throw res;
    }
    const data = res.data;
    if (!data?.full_name) throw new GhError(500, "Repo creation returned an unexpected response.");
    return { fullName: data.full_name, htmlUrl: data.html_url, defaultBranch: data.default_branch || "main", created: true };
  }
  throw new GhError(409, `Could not create the repo — "${cleanName}" seems taken and a fallback name was rejected. Pick another name.`);
}

// ─── snapshot builder: all user data → repo files ────────────────────────────

export interface SnapshotFile { path: string; content: string }

function slugify(s: string, fallback: string): string {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || fallback;
}

export async function buildSnapshot(userId: string): Promise<{ files: SnapshotFile[]; counts: Record<string, number> }> {
  const [user, sessions, memories, skills, stats, syncLogs] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, createdAt: true } }),
    db.session.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        memories: { orderBy: { createdAt: "asc" }, select: { id: true, kind: true, content: true, keywords: true, importance: true, accessCount: true, createdAt: true, updatedAt: true } },
        ledgerPages: { orderBy: { updatedAt: "desc" }, select: { path: true, content: true, budget: true, updatedAt: true } },
      },
    }),
    db.memory.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
    db.skill.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.usageStat.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5000 }),
    db.syncLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  if (!user) throw new Error("user not found");

  const files: SnapshotFile[] = [];

  // manifest — deliberately deterministic (no volatile timestamps) so that
  // unchanged data produces an unchanged file (sha-based skip in sync)
  const counts = {
    sessions: sessions.length,
    memories: memories.length,
    skills: skills.length,
    ledgerPages: sessions.reduce((n, s) => n + s.ledgerPages.length, 0),
    statEvents: stats.length,
  };
  files.push({
    path: "index.json",
    content: JSON.stringify({ service: "ZaiMem", kind: "cloud-db-manifest", version: 1, counts }, null, 2),
  });

  // README
  files.push({
    path: "README.md",
    content: `# ZaiMem Cloud DB

> This **private** repository is the personal cloud database of a ZaiMem user.
> It is **auto-synced** by [ZaiMem](/) — session memory & context enhancer for chat.z.ai.

| Data | Count |
|---|---|
| Sessions | ${counts.sessions} |
| Memories | ${counts.memories} |
| Skills | ${counts.skills} |
| Ledger pages | ${counts.ledgerPages} |
| Usage events | ${counts.statEvents} |

## Layout

\`\`\`
index.json            manifest + counts (generated at sync time)
memories.json         all long-term memories (facts, decisions, preferences…)
vectors.jsonl         embedding vectors, one JSON object per line
sessions/<slug>.json  one file per synced chat session (summary, memories, ledger)
skills.json           SKILL.md registry (incl. the zcode-smart-skill port)
stats.json            token-saver & enhancer usage aggregates
sync/log.json         recent sync history
\`\`\`

Files are rewritten on every data change (debounced). Do not edit —
your edits will be overwritten by the next sync. Sync history: sync/log.json.
`,
  });

  // memories (without embeddings) + vectors as JSONL
  files.push({
    path: "memories.json",
    content: JSON.stringify(memories.map((m) => ({
      id: m.id,
      sessionId: m.sessionId,
      kind: m.kind,
      content: m.content,
      keywords: m.keywords,
      importance: m.importance,
      accessCount: m.accessCount,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })), null, 2),
  });
  files.push({
    path: "vectors.jsonl",
    content: memories.map((m) => JSON.stringify({ id: m.id, dim: JSON.parse(m.embedding).length, embedding: m.embedding })).join("\n") || "",
  });

  // per-session files
  for (const s of sessions) {
    const name = `${slugify(s.title, "session")}-${s.id.slice(-6)}.json`;
    files.push({
      path: `sessions/${name}`,
      content: JSON.stringify({
        id: s.id,
        externalId: s.externalId,
        title: s.title,
        topic: s.topic,
        status: s.status,
        summary: s.summary,
        turns: s.turns,
        tokensSaved: s.tokensSaved,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        memories: s.memories,
        ledgerPages: s.ledgerPages,
      }, null, 2),
    });
  }

  // skills registry (full SKILL.md bodies included — it is the user's data)
  files.push({
    path: "skills.json",
    content: JSON.stringify(skills.map((k) => ({
      name: k.name, description: k.description, triggers: JSON.parse(k.triggers || "[]"),
      source: k.source, enabled: k.enabled, body: k.body,
    })), null, 2),
  });

  // stats aggregates
  const totals = stats.reduce(
    (acc, s) => ({ events: acc.events + 1, tokensIn: acc.tokensIn + s.tokensIn, tokensOut: acc.tokensOut + s.tokensOut, tokensSaved: acc.tokensSaved + s.tokensSaved }),
    { events: 0, tokensIn: 0, tokensOut: 0, tokensSaved: 0 },
  );
  files.push({
    path: "stats.json",
    content: JSON.stringify({ totals, events: stats.map((s) => ({ action: s.action, tokensIn: s.tokensIn, tokensOut: s.tokensOut, tokensSaved: s.tokensSaved, detail: s.detail, createdAt: s.createdAt })) }, null, 2),
  });

  // recent sync log
  files.push({
    path: "sync/log.json",
    content: JSON.stringify(syncLogs.map((l) => ({ action: l.action, status: l.status, files: l.files, detail: l.detail, createdAt: l.createdAt })), null, 2),
  });

  return { files, counts };
}

// ─── sync engine ─────────────────────────────────────────────────────────────

const MANAGED_TOP = new Set(["index.json", "README.md", "memories.json", "vectors.jsonl", "skills.json", "stats.json", "sync/log.json"]);
const MANAGED_DIR = "sessions/";

export interface SyncResult {
  pushed: number;
  unchanged: number;
  deleted: number;
  totalFiles: number;
  counts: Record<string, number>;
}

async function pushFile(pat: string, full: string, branch: string, path: string, content: string, sha?: string) {
  await gh(pat, `/repos/${full}/contents/${encodeURI(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `ZaiMem sync: ${sha ? "update" : "add"} ${path}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
}

async function deleteFile(pat: string, full: string, branch: string, path: string, sha: string) {
  await gh(pat, `/repos/${full}/contents/${encodeURI(path)}`, {
    method: "DELETE",
    body: JSON.stringify({ message: `ZaiMem sync: remove ${path}`, sha, branch }),
  });
}

/** Force a full sync right now. Throws on failure (caller decides logging). */
export async function syncUser(
  userId: string,
  trigger: "pair" | "force" | "auto" | "scheduled",
): Promise<SyncResult> {
  const link = await db.githubLink.findUnique({ where: { userId } });
  if (!link) throw new GhError(400, "GitHub is not paired for this account.");
  const pat = await loadPat(link);

  await db.githubLink.update({ where: { userId }, data: { status: "syncing" } });
  try {
    const { files, counts } = await buildSnapshot(userId);

    // remote tree (blob shas) — one call
    const remote = new Map<string, string>();
    try {
      const { data } = await ghJson<{ tree: { path: string; type: string; sha: string }[] }>(
        pat, `/repos/${link.repoFull}/git/trees/${encodeURIComponent(link.branch)}?recursive=1`,
      );
      for (const t of data?.tree ?? []) if (t.type === "blob") remote.set(t.path, t.sha);
    } catch (e) {
      if (!(e instanceof GhError && (e.status === 404 || e.status === 409))) throw e;
      // empty repo / unborn branch — everything will be created
    }

    let pushed = 0, unchanged = 0;
    const localPaths = new Set<string>();
    for (const f of files) {
      localPaths.add(f.path);
      const sha = computeBlobSha(f.content);
      if (remote.get(f.path) === sha) { unchanged++; continue; }
      await pushFile(pat, link.repoFull, link.branch, f.path, f.content, remote.get(f.path));
      pushed++;
    }

    // delete managed files that vanished locally (never touch user's own files)
    let deleted = 0;
    for (const [path, sha] of remote) {
      const managed = MANAGED_TOP.has(path) || path.startsWith(MANAGED_DIR);
      if (managed && !localPaths.has(path)) {
        await deleteFile(pat, link.repoFull, link.branch, path, sha).catch(() => {});
        deleted++;
      }
    }

    await db.githubLink.update({
      where: { userId },
      data: { status: "active", lastError: null, lastSyncAt: new Date(), syncCount: { increment: 1 } },
    });
    await db.syncLog.create({
      data: {
        userId,
        action: trigger === "auto" ? "auto" : trigger === "pair" ? "pair" : trigger === "scheduled" ? "backup" : "force_sync",
        status: "ok", files: pushed, detail: `${pushed} pushed · ${unchanged} unchanged · ${deleted} removed · ${JSON.stringify(counts)}`,
      },
    });
    return { pushed, unchanged, deleted, totalFiles: files.length, counts };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.githubLink.update({ where: { userId }, data: { status: "error", lastError: msg.slice(0, 500) } }).catch(() => {});
    await db.syncLog.create({ data: { userId, action: "error", status: "error", files: 0, detail: msg.slice(0, 500) } }).catch(() => {});
    throw e;
  }
}

// ─── pair / unpair ───────────────────────────────────────────────────────────

export async function pairUser(userId: string, pat: string, repoName?: string) {
  const { login } = await validatePat(pat);
  const repo = await ensurePrivateRepo(pat, login, repoName);
  const link = await db.githubLink.upsert({
    where: { userId },
    create: {
      userId, patEnc: encryptSecret(pat), patHint: secretHint(pat), login,
      repoName: repo.fullName.split("/")[1], repoFull: repo.fullName, repoUrl: repo.htmlUrl,
      branch: repo.defaultBranch, status: "active",
    },
    update: {
      patEnc: encryptSecret(pat), patHint: secretHint(pat), login,
      repoName: repo.fullName.split("/")[1], repoFull: repo.fullName, repoUrl: repo.htmlUrl,
      branch: repo.defaultBranch, status: "active", lastError: null,
    },
  });
  await db.syncLog.create({
    data: { userId, action: repo.created ? "create_repo" : "pair", status: "ok", files: 0, detail: `${repo.fullName}${repo.created ? " (created private)" : " (reused)"}` },
  });
  const result = await syncUser(userId, "pair");
  return { link, repo, result };
}

export async function unpairUser(userId: string) {
  const link = await db.githubLink.findUnique({ where: { userId } });
  if (!link) return false;
  await db.githubLink.delete({ where: { userId } });
  await db.syncLog.create({ data: { userId, action: "unpair", status: "ok", files: 0, detail: `${link.repoFull} detached (repo kept on GitHub)` } });
  return true;
}

// ─── debounced auto-sync queue ───────────────────────────────────────────────

const inflight = new Map<string, Promise<unknown>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function withMutex<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = inflight.get(userId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  inflight.set(userId, next.finally(() => { if (inflight.get(userId) === next) inflight.delete(userId); }));
  return next;
}

/**
 * Fire-and-forget auto sync. Call after ANY data mutation for the user.
 * Coalesces bursts (e.g. an agent remembering 5 facts in a row) into one
 * sync ~4s after the last write. No-ops when auto-sync is disabled or
 * GitHub is not paired (or already syncing for that user).
 */
export function queueSync(userId: string): void {
  const existing = timers.get(userId);
  if (existing) clearTimeout(existing);
  timers.set(userId, setTimeout(async () => {
    timers.delete(userId);
    if (inflight.has(userId)) return; // a sync is running; it sees latest data anyway
    try {
      const link = await db.githubLink.findUnique({ where: { userId }, select: { autoSync: true } });
      if (!link?.autoSync) return;
      await withMutex(userId, () => syncUser(userId, "auto"));
    } catch { /* status + error already recorded inside syncUser */ }
  }, 4000));
}

// ─── point-in-time restore (from snapshot history) ───────────────────────────

export interface SnapshotCommit {
  sha: string;
  date: string;
  message: string;
}

/** List recent snapshot commits (commits that touched memories.json). */
export async function listSnapshotHistory(userId: string, take = 10): Promise<SnapshotCommit[]> {
  const link = await db.githubLink.findUnique({ where: { userId } });
  if (!link) throw new GhError(400, "GitHub is not paired for this account.");
  const pat = await loadPat(link);
  const { data } = await ghJson<{ commit: { message: string; author?: { date?: string } }; sha: string }[]>(
    pat,
    `/repos/${link.repoFull}/commits?path=memories.json&per_page=${Math.min(30, take)}&sha=${encodeURIComponent(link.branch)}`,
  );
  return (data ?? []).map((c) => ({
    sha: c.sha,
    date: c.commit?.author?.date ?? new Date(0).toISOString(),
    message: (c.commit?.message ?? "").split("\n")[0].slice(0, 120),
  }));
}

export interface RestoreResult {
  sha: string;
  imported: number;
  deduped: number;
  skipped: number;
}

/**
 * Restore memories from a snapshot commit. Reads memories.json at that ref and
 * re-imports every entry through rememberMemory — auto-dedupe makes re-adding
 * current data a no-op, so restore is safely additive (nothing is deleted).
 */
export async function restoreFromSnapshot(userId: string, sha: string): Promise<RestoreResult> {
  const link = await db.githubLink.findUnique({ where: { userId } });
  if (!link) throw new GhError(400, "GitHub is not paired for this account.");
  const pat = await loadPat(link);
  const { data } = await ghJson<{ content: string; encoding: string }>(
    pat,
    `/repos/${link.repoFull}/contents/memories.json?ref=${encodeURIComponent(sha)}`,
  );
  if (!data || data.encoding !== "base64") throw new GhError(422, "Could not read memories.json at that ref.");
  let entries: unknown;
  try {
    entries = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  } catch {
    throw new GhError(422, "memories.json at that ref is not valid JSON.");
  }
  if (!Array.isArray(entries)) throw new GhError(422, "Unexpected memories.json format.");

  const { rememberMemory } = await import("./memory");
  let imported = 0, deduped = 0, skipped = 0;
  for (const e of entries.slice(0, 2000)) {
    const content = typeof (e as { content?: unknown })?.content === "string" ? (e as { content: string }).content.trim() : "";
    if (!content) { skipped++; continue; }
    try {
      const r = await rememberMemory({ userId, content, kind: (e as { kind?: string }).kind });
      if (r.created) imported++; else deduped++;
    } catch { skipped++; }
  }
  await db.syncLog.create({
    data: { userId, action: "restore", status: "ok", files: imported, detail: `restored from ${sha.slice(0, 8)}: ${imported} imported, ${deduped} deduped, ${skipped} skipped` },
  }).catch(() => {});
  return { sha, imported, deduped, skipped };
}

// ─── cross-account rescue import (new account ← old account's repo) ──────────

export interface ImportResult {
  repo: string;
  branch: string;
  memories: { imported: number; deduped: number; skipped: number };
  skillsImported: number;
  sessions: { imported: number; skipped: number };
}

/**
 * Re-sync a ZaiMem account from an existing ZaiMem cloud-DB repo on GitHub.
 * Use case: the user created a fresh ZaiMem account (new token) and wants
 * their earlier data back. Needs only repo + PAT — pairing NOT required.
 * Imports (all additive, dedupe makes re-imports harmless):
 *   • memories.json  → long-term memories (embeddings re-computed)
 *   • sessions/*.json→ session shells with titles + summaries
 *   • skills.json    → skills this account does not have yet (source: "imported")
 */
export async function importFromRepo(userId: string, pat: string, repoFull: string, branch?: string): Promise<ImportResult> {
  await validatePat(pat);
  const clean = repoFull.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(clean)) {
    throw new GhError(400, "Repo must look like owner/name (or a github.com URL).");
  }
  const { data: repoInfo } = await ghJson<{ default_branch: string }>(pat, `/repos/${clean}`);
  const br = branch?.trim() || repoInfo?.default_branch || "main";

  async function readFile(path: string): Promise<string | null> {
    try {
      const { data } = await ghJson<{ content: string; encoding: string }>(
        pat, `/repos/${clean}/contents/${encodeURI(path)}?ref=${encodeURIComponent(br)}`,
      );
      if (!data || data.encoding !== "base64") return null;
      return Buffer.from(data.content, "base64").toString("utf-8");
    } catch (e) {
      if (e instanceof GhError && e.status === 404) return null;
      throw e;
    }
  }

  const result: ImportResult = {
    repo: clean, branch: br,
    memories: { imported: 0, deduped: 0, skipped: 0 },
    skillsImported: 0,
    sessions: { imported: 0, skipped: 0 },
  };

  // 1. memories.json — the core of the account
  const memRaw = await readFile("memories.json");
  if (memRaw) {
    let entries: unknown;
    try { entries = JSON.parse(memRaw); } catch { throw new GhError(422, "memories.json in that repo is not valid JSON."); }
    if (!Array.isArray(entries)) throw new GhError(422, "Unexpected memories.json format.");
    const { rememberMemory } = await import("./memory");
    for (const e of (entries as { content?: unknown; kind?: unknown }[]).slice(0, 2000)) {
      const content = typeof e.content === "string" ? e.content.trim() : "";
      if (!content) { result.memories.skipped++; continue; }
      try {
        const r = await rememberMemory({ userId, content, kind: typeof e.kind === "string" ? e.kind : undefined });
        if (r.created) result.memories.imported++; else result.memories.deduped++;
      } catch { result.memories.skipped++; }
    }
  }

  // 2. sessions/*.json — restore session shells (title, summary, counters)
  let sessionFiles: { path: string }[] = [];
  try {
    const { data } = await ghJson<{ tree: { path: string; type: string }[] }>(
      pat, `/repos/${clean}/git/trees/${encodeURIComponent(br)}?recursive=1`,
    );
    sessionFiles = (data?.tree ?? [])
      .filter((t) => t.type === "blob" && t.path.startsWith("sessions/") && t.path.endsWith(".json"))
      .slice(0, 300);
  } catch { /* unborn branch / empty repo — no sessions to walk */ }
  for (const f of sessionFiles) {
    const raw = await readFile(f.path);
    if (!raw) continue;
    try {
      const s = JSON.parse(raw) as {
        id?: string; title?: string; topic?: string; status?: string;
        summary?: string; turns?: number; tokensSaved?: number;
      };
      const oldId = (typeof s.id === "string" && s.id ? s.id : f.path).slice(0, 200);
      const exists = await db.session.findFirst({ where: { userId, externalId: oldId }, select: { id: true } });
      if (exists) { result.sessions.skipped++; continue; }
      await db.session.create({
        data: {
          userId,
          externalId: oldId,
          title: (s.title || "Imported session").slice(0, 120),
          topic: typeof s.topic === "string" ? s.topic.slice(0, 500) : null,
          origin: "imported",
          status: s.status === "archived" ? "archived" : "summarized",
          summary: typeof s.summary === "string" ? s.summary.slice(0, 8000) : null,
          turns: Number.isFinite(s.turns) ? Math.max(0, Math.min(100_000, Number(s.turns))) : 0,
          tokensSaved: Number.isFinite(s.tokensSaved) ? Math.max(0, Math.min(10_000_000, Number(s.tokensSaved))) : 0,
        },
      });
      result.sessions.imported++;
    } catch { result.sessions.skipped++; }
  }

  // 3. skills.json — bring over skills this account does not have yet
  const skillsRaw = await readFile("skills.json");
  if (skillsRaw) {
    try {
      const list = JSON.parse(skillsRaw) as { name?: unknown; description?: unknown; triggers?: unknown; body?: unknown }[];
      for (const k of Array.isArray(list) ? list : []) {
        if (typeof k.name !== "string" || !k.name.trim()) continue;
        const exists = await db.skill.findFirst({ where: { userId, name: k.name }, select: { id: true } });
        if (exists) continue;
        const triggers = Array.isArray(k.triggers) ? k.triggers.map(String) : [];
        await db.skill.create({
          data: {
            userId,
            name: k.name.slice(0, 80),
            description: typeof k.description === "string" ? k.description.slice(0, 1000) : "",
            triggers: JSON.stringify(triggers),
            body: typeof k.body === "string" ? k.body.slice(0, 60_000) : "",
            source: "imported",
          },
        });
        result.skillsImported++;
      }
    } catch { /* malformed skills.json — skip silently */ }
  }

  await db.syncLog.create({
    data: {
      userId, action: "import", status: "ok", files: result.memories.imported,
      detail: `imported from ${clean}@${br}: ${result.memories.imported} memories (+${result.memories.deduped} dupes), ${result.sessions.imported} sessions, ${result.skillsImported} skills`,
    },
  }).catch(() => {});
  queueSync(userId);
  return result;
}
