/**
 * ZaiMem GitHub Cloud DB engine test
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs the full engine against an in-process MOCK GitHub API — no network,
 * no real PAT needed. Verifies:
 *   1.  computeBlobSha matches git hash-object
 *   2.  PAT validation (ok + bad credentials)
 *   3.  private repo auto-creation (and 422 → fallback handling)
 *   4.  pairUser: validate → create repo → first full sync (all files pushed)
 *   5.  snapshot layout (index/README/memories/vectors/sessions/skills/stats/log)
 *   6.  second sync: unchanged files skipped (git blob sha compare)
 *   7.  data change propagation (new memory → memories.json + vectors.jsonl)
 *   8.  deletion propagation (session deleted → its file removed from repo)
 *   9.  queueSync debounce (auto-sync fires within ~8s, coalesced)
 *   10. sync error path records status=error + SyncLog
 *   11. unpair detaches (repo kept in mock account)
 *
 * Run: bun scripts/e2e-github-unit.ts
 */

import { db } from "@/lib/db";
import { computeBlobSha } from "@/lib/zaimem/crypto";
import {
  validatePat, ensurePrivateRepo, pairUser, syncUser, unpairUser, queueSync, GhError,
} from "@/lib/zaimem/github";

// ─── mock GitHub API ─────────────────────────────────────────────────────────
const MOCK = "https://github-mock.local";

interface MockFile { content: string; sha: string }
const mockState = {
  badPat: false,
  repos: new Map<string, { private: boolean; description: string; default_branch: string; files: Map<string, MockFile> }>(),
  putCalls: 0,
  deleteCalls: 0,
  failTreeOnce: false,
};
const realFetch = globalThis.fetch;

async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(MOCK)) return realFetch(input as RequestInfo, init);

  const u = new URL(url);
  const path = u.pathname;
  const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? "";
  const pat = auth.replace(/^Bearer /, "");
  const json = (status: number, data: unknown, headers?: Record<string, string>) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });

  if (pat !== "ghp_mocktoken1234567890abcdefghij") {
    return json(401, { message: "Bad credentials" });
  }
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

  // GET /user
  if (path === "/user" && init?.method !== "POST") {
    if (mockState.badPat) return json(401, { message: "Bad credentials" });
    return json(200, { login: "octocat" });
  }
  // POST /user/repos
  if (path === "/user/repos") {
    const name = String(body.name ?? "");
    const full = `octocat/${name}`;
    if (mockState.repos.has(full)) return json(422, { message: `name already exists` });
    mockState.repos.set(full, { private: true, description: String(body.description ?? ""), default_branch: "main", files: new Map() });
    return json(201, { full_name: full, html_url: `https://github.com/${full}`, default_branch: "main", private: true });
  }
  // /repos/:full/...
  const m = path.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/);
  if (m) {
    const full = `${m[1]}/${m[2]}`;
    const repo = mockState.repos.get(full);
    if (!repo) return json(404, { message: "Not Found" });
    const rest = m[3] ?? "";

    if (rest === "" ) return json(200, { full_name: full, html_url: `https://github.com/${full}`, default_branch: repo.default_branch, private: repo.private, description: repo.description });
    if (rest.startsWith("/git/trees/")) {
      if (mockState.failTreeOnce) { mockState.failTreeOnce = false; return json(500, { message: "mock tree failure" }); }
      const tree = [...repo.files.entries()].map(([p, f]) => ({ path: p, type: "blob", sha: f.sha }));
      return json(200, { tree });
    }
    if (rest.startsWith("/contents/")) {
      const filePath = decodeURIComponent(rest.slice("/contents/".length));
      if (init?.method === "PUT") {
        mockState.putCalls++;
        const content = Buffer.from(String(body.content ?? ""), "base64").toString("utf8");
        repo.files.set(filePath, { content, sha: computeBlobSha(content) });
        return json(201, { content: { sha: computeBlobSha(content) } });
      }
      if (init?.method === "DELETE") {
        mockState.deleteCalls++;
        repo.files.delete(filePath);
        return json(200, { ok: true });
      }
      const f = repo.files.get(filePath);
      if (!f) return json(404, { message: "Not Found" });
      return json(200, { sha: f.sha, content: Buffer.from(f.content).toString("base64") });
    }
  }
  return json(404, { message: `mock: unhandled ${init?.method ?? "GET"} ${path}` });
}

// ─── test harness ────────────────────────────────────────────────────────────
let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  process.env.GITHUB_API_BASE = MOCK;
  globalThis.fetch = mockFetch as typeof fetch;

  console.log("\n── 1. Blob sha ───────────────────────────────");
  check("computeBlobSha matches git hash-object", computeBlobSha("hello world") === "95d09f2b10159347eece71399a7e2e907ea3df4f", computeBlobSha("hello world"));

  console.log("\n── 2. Seed user + data ───────────────────────");
  // clean up previous runs
  const old = await db.user.findMany({ where: { token: { startsWith: "zm_ghunit_" } } });
  for (const u of old) await db.user.delete({ where: { id: u.id } }).catch(() => {});

  const user = await db.user.create({ data: { token: `zm_ghunit_${Math.random().toString(36).slice(2, 10)}`, label: "github-unit" } });
  const session = await db.session.create({ data: { userId: user.id, title: "GitHub unit session", topic: "testing the cloud db", turns: 3 } });
  await db.memory.create({ data: { userId: user.id, sessionId: session.id, kind: "fact", content: "User prefers dark mode in every IDE", keywords: "dark mode,ide", embedding: JSON.stringify(new Array(384).fill(0.01)) } });
  await db.memory.create({ data: { userId: user.id, sessionId: session.id, kind: "decision", content: "Chose SQLite over Postgres for the sandbox", keywords: "sqlite,postgres", embedding: JSON.stringify(new Array(384).fill(0.02)) } });
  await db.ledgerPage.create({ data: { userId: user.id, sessionId: session.id, path: "notes.md", content: "## findings\n- mock ledger page" } });
  await db.skill.create({ data: { userId: user.id, name: "unit-skill", description: "test skill", triggers: JSON.stringify(["unit"]), body: "# unit skill", source: "builtin" } });
  await db.usageStat.create({ data: { userId: user.id, action: "remember", tokensIn: 100, tokensOut: 20, tokensSaved: 80 } });
  check("user + session + 2 memories + ledger + skill + stat seeded", true);

  console.log("\n── 3. PAT validation ─────────────────────────");
  const v = await validatePat("ghp_mocktoken1234567890abcdefghij");
  check("valid PAT → login octocat", v.login === "octocat", v);
  mockState.badPat = true;
  let rejected = false;
  try { await validatePat("ghp_mocktoken1234567890abcdefghij"); } catch (e) { rejected = e instanceof GhError && e.status === 401; }
  check("bad credentials → GhError 401", rejected);
  mockState.badPat = false;

  console.log("\n── 4. Repo provisioning ──────────────────────");
  const repo = await ensurePrivateRepo("ghp_mocktoken1234567890abcdefghij", "octocat", "zaimem-cloud-db");
  check("private repo created", repo.created === true && repo.fullName === "octocat/zaimem-cloud-db", repo);
  check("repo marked private in mock", mockState.repos.get(repo.fullName)?.private === true);
  let reused = false;
  const repo2 = await ensurePrivateRepo("ghp_mocktoken1234567890abcdefghij", "octocat", "zaimem-cloud-db");
  reused = repo2.created === false;
  check("existing managed repo reused (not recreated)", reused, repo2);

  console.log("\n── 5. Pair + first sync ──────────────────────");
  const pairRes = await pairUser(user.id, "ghp_mocktoken1234567890abcdefghij", "zaimem-cloud-db");
  check("pair sync pushed all files", pairRes.result.pushed === pairRes.result.totalFiles, pairRes.result);
  check("snapshot has 8 files (7 fixed + 1 session)", pairRes.result.totalFiles === 8, pairRes.result.totalFiles);
  const files = mockState.repos.get("octocat/zaimem-cloud-db")!.files;
  const paths = [...files.keys()].sort();
  check("layout: index/README/memories/vectors/skills/stats/log + sessions/", paths.includes("index.json") && paths.includes("README.md") && paths.includes("memories.json") && paths.includes("vectors.jsonl") && paths.includes("skills.json") && paths.includes("stats.json") && paths.includes("sync/log.json") && paths.some((p) => p.startsWith("sessions/")), paths);
  const memJson = JSON.parse(files.get("memories.json")!.content);
  check("memories.json has 2 memories", memJson.length === 2 && memJson.some((m: { content: string }) => m.content.includes("dark mode")), memJson.length);
  const sessFile = paths.find((p) => p.startsWith("sessions/"))!;
  const sessJson = JSON.parse(files.get(sessFile)!.content);
  check("session file embeds memories + ledger", sessJson.title === "GitHub unit session" && sessJson.memories.length === 2 && sessJson.ledgerPages.length === 1, sessJson.title);
  const vecLines = files.get("vectors.jsonl")!.content.split("\n");
  check("vectors.jsonl one line per memory", vecLines.length === 2 && JSON.parse(vecLines[0]).dim === 384);
  const link = await db.githubLink.findUnique({ where: { userId: user.id } });
  check("GithubLink stored (PAT never in plaintext field)", !!link && !link.patEnc.includes("ghp_mock") && link.patHint.length === 8, link?.patHint);
  check("sync log recorded", (await db.syncLog.count({ where: { userId: user.id } })) >= 2);

  console.log("\n── 6. Idempotent second sync ─────────────────");
  mockState.putCalls = 0;
  const res2 = await syncUser(user.id, "force");
  check("unchanged files skipped — only sync/log.json repushed", res2.pushed === 1 && res2.unchanged === 7, res2);
  check("repo file count stable", files.size === 8, files.size);

  console.log("\n── 7. Change propagation ─────────────────────");
  await db.memory.create({ data: { userId: user.id, sessionId: null, kind: "preference", content: "Prefers concise answers in Russian", keywords: "concise,russian", embedding: JSON.stringify(new Array(384).fill(0.03)) } });
  const res3 = await syncUser(user.id, "force");
  // memories.json + vectors.jsonl + index.json + README.md (counts table) + sync/log.json
  check("new memory pushes 5 files (memories+vectors+index+README+log)", res3.pushed === 5, res3);
  check("repo now has 3 memories in memories.json", JSON.parse(files.get("memories.json")!.content).length === 3);

  console.log("\n── 8. Deletion propagation ───────────────────");
  await db.session.delete({ where: { id: session.id } });
  const res4 = await syncUser(user.id, "force");
  check("deleted session file removed from repo", res4.deleted === 1 && !files.has(sessFile), { deleted: res4.deleted, paths: [...files.keys()] });
  check("repo file count back to 7", files.size === 7, files.size);

  console.log("\n── 9. Debounced auto-sync ────────────────────");
  const before = (await db.githubLink.findUnique({ where: { userId: user.id } }))!.syncCount;
  await db.memory.create({ data: { userId: user.id, kind: "fact", content: "Auto-sync test memory", keywords: "auto", embedding: JSON.stringify(new Array(384).fill(0.04)) } });
  queueSync(user.id); // should fire ~4s later, coalesced
  queueSync(user.id); // double call must coalesce into one
  let synced = false;
  for (let i = 0; i < 16; i++) {
    await sleep(500);
    const after = (await db.githubLink.findUnique({ where: { userId: user.id } }))!.syncCount;
    if (after > before) { synced = true; break; }
  }
  check("auto-sync fired within 8s (coalesced)", synced);

  console.log("\n── 10. Error path ────────────────────────────");
  mockState.failTreeOnce = true;
  let errRecorded = false;
  try { await syncUser(user.id, "force"); } catch { errRecorded = true; }
  const linkAfterErr = await db.githubLink.findUnique({ where: { userId: user.id } });
  check("failed sync throws + status=error + lastError set", errRecorded && linkAfterErr?.status === "error" && !!linkAfterErr.lastError, linkAfterErr?.status);
  const errLog = await db.syncLog.findFirst({ where: { userId: user.id, status: "error" }, orderBy: { createdAt: "desc" } });
  check("error SyncLog entry written", !!errLog);
  // recover
  await syncUser(user.id, "force");
  check("recovers to healthy on next sync", (await db.githubLink.findUnique({ where: { userId: user.id } }))!.status === "active");

  console.log("\n── 11. Unpair ────────────────────────────────");
  const up = await unpairUser(user.id);
  check("unpaired, link removed, log kept", up && (await db.githubLink.findUnique({ where: { userId: user.id } })) === null);
  check("repo kept in GitHub account", mockState.repos.has("octocat/zaimem-cloud-db"));
  let noSync = false;
  try { await syncUser(user.id, "force"); } catch { noSync = true; }
  check("sync after unpair rejected", noSync);

  // cleanup test user
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  (globalThis as { fetch: typeof fetch }).fetch = realFetch;

  console.log(`\n${failures === 0 ? "🎉 GITHUB ENGINE TESTS ALL PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
