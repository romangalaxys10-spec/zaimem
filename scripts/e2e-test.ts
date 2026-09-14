/**
 * ZaiMem end-to-end flow test — exercises the full user journey:
 * token issuance → login → MCP handshake → all 33 tools → dashboard APIs.
 */

const BASE = "http://localhost:3000";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : "");
  }
}

interface RpcRes { jsonrpc: string; id?: number; result?: any; error?: { code: number; message: string; data?: unknown } }

async function rpc(method: string, params: unknown, token: string, id = 1, sessionId?: string): Promise<RpcRes> {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(sessionId ? { "MCP-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return { ...(await res.json()), __session: res.headers.get("mcp-session-id") } as RpcRes;
}

async function main() {
  console.log("\n── 1. Auth flow ──────────────────────────────");
  const initRes = await fetch(`${BASE}/api/auth/init`, { method: "POST" });
  const initData = await initRes.json();
  check("token issued", initRes.ok && typeof initData.token === "string" && initData.token.startsWith("zm_"), initData);
  const token: string = initData.token;

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const loginData = await loginRes.json();
  check("token login", loginRes.ok, loginData);

  const badLogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "zm_wrong" }),
  });
  check("invalid token rejected", badLogin.status === 401);

  const mcpNoAuth = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  check("MCP rejects unauthenticated", mcpNoAuth.status === 401);

  console.log("\n── 2. MCP handshake ──────────────────────────");
  const initRpc = await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "e2e-test", version: "1.0.0" },
  }, token);
  check("initialize returns serverInfo zaimem", initRpc.result?.serverInfo?.name === "zaimem", initRpc);
  check("protocol negotiated", initRpc.result?.protocolVersion === "2025-03-26");
  const mcpSession = (initRpc as any).__session;
  check("mcp-session-id issued", typeof mcpSession === "string");

  const tools = await rpc("tools/list", {}, token, 2, mcpSession);
  const toolNames: string[] = (tools.result?.tools ?? []).map((t: any) => t.name);
  check("33 tools listed", toolNames.length === 33, toolNames);
  check(
    "core tools present",
    ["zaimem_sync_session", "zaimem_remember", "zaimem_recall", "zaimem_enhance_context",
     "zaimem_save_tokens", "zaimem_detect_skill", "zaimem_list_skills", "zaimem_get_skill",
     "zaimem_ledger_write", "zaimem_ledger_read", "zaimem_session_summary", "zaimem_handoff_brief",
     "zaimem_ingest_file", "zaimem_forget",
     "zaimem_remember_many", "zaimem_doc_read", "zaimem_session_status",
     "zaimem_brief_me", "zaimem_resume", "zaimem_task_next",
     "zaimem_session_create", "zaimem_session_prompt", "zaimem_project_brief", "zaimem_project_handoff",
     "zaimem_ingest_meeting", "zaimem_meetings_list", "zaimem_meeting_search",
     "zaimem_web_search", "zaimem_web_fetch", "zaimem_calc", "zaimem_time", "zaimem_think",
     "zaimem_headroom",
    ].every((t) => toolNames.includes(t)),
  );

  console.log("\n── 3. Session sync + memory ──────────────────");
  const sync = await rpc("tools/call", {
    name: "zaimem_sync_session",
    arguments: { title: "E2E test session", topic: "building ZaiMem vector memory system" },
  }, token, 3, mcpSession);
  const syncText: string = sync.result?.content?.[0]?.text ?? "";
  check("sync_session returns boot context", syncText.includes("✅ ZaiMem session synced"), syncText.slice(0, 120));
  const sessionId = sync.result?._meta?.session_id;
  check("session_id returned in _meta", typeof sessionId === "string");

  const rem1 = await rpc("tools/call", {
    name: "zaimem_remember",
    arguments: { content: "User's API key for the payment gateway is pg_live_9911 and must never be logged.", kind: "fact", importance: 0.9, session_id: sessionId },
  }, token, 4, mcpSession);
  check("remember stores fact", (rem1.result?.content?.[0]?.text ?? "").includes("Stored as fact"), rem1.result);

  const rem2 = await rpc("tools/call", {
    name: "zaimem_remember",
    arguments: { content: "User prefers TypeScript strict mode and violet UI accents.", kind: "preference", importance: 0.7 },
  }, token, 5, mcpSession);
  check("remember stores preference", (rem2.result?.content?.[0]?.text ?? "").includes("preference"));

  const remDup = await rpc("tools/call", {
    name: "zaimem_remember",
    arguments: { content: "User's API key for the payment gateway is pg_live_9911 and must never be logged.", kind: "fact", importance: 0.9 },
  }, token, 6, mcpSession);
  check("near-duplicate deduped", (remDup.result?.content?.[0]?.text ?? "").includes("near-duplicate"), remDup.result);

  const recall = await rpc("tools/call", {
    name: "zaimem_recall",
    arguments: { query: "payment gateway api key logging", limit: 3 },
  }, token, 7, mcpSession);
  const recallText: string = recall.result?.content?.[0]?.text ?? "";
  check("recall finds the api key memory", recallText.includes("pg_live_9911"), recallText.slice(0, 200));

  console.log("\n── 4. Context enhancer + skills ──────────────");
  const enhance = await rpc("tools/call", {
    name: "zaimem_enhance_context",
    arguments: {
      current_message: "How should I configure the payment gateway api key handling in my TypeScript project?",
      session_id: sessionId,
    },
  }, token, 8, mcpSession);
  const enhText: string = enhance.result?.content?.[0]?.text ?? "";
  check("enhance_context injects memory inventory", enhText.includes("ZaiMem context boost") && enhText.includes("pg_live_9911"), enhText.slice(0, 200));

  const detect = await rpc("tools/call", {
    name: "zaimem_detect_skill",
    arguments: { task_description: "This algorithm keeps failing again and I need complex concurrency optimization with tricky invariants" },
  }, token, 9, mcpSession);
  const detText: string = detect.result?.content?.[0]?.text ?? "";
  check("detect_skill triggers smart", detText.includes("Entering smart mode") && detText.includes("difficulty:"), detText.slice(0, 200));
  const hardBudget = detText.includes("difficulty: hard") && detText.includes("iteration budget: 12");
  check("hard difficulty → budget 12", hardBudget, detText.slice(0, 300));

  const easyDetect = await rpc("tools/call", {
    name: "zaimem_detect_skill",
    arguments: { task_description: "just change the button color and title text" },
  }, token, 10, mcpSession);
  check("easy task → no smart trigger", (easyDetect.result?.content?.[0]?.text ?? "").includes("No skill auto-triggered"), easyDetect.result);

  const skills = await rpc("tools/call", { name: "zaimem_list_skills", arguments: {} }, token, 11, mcpSession);
  const listText: string = skills.result?.content?.[0]?.text ?? "";
  check("skill registry has smart/context-boost/token-frugal", listText.includes("smart") && listText.includes("context-boost") && listText.includes("token-frugal"));

  const getSkill = await rpc("tools/call", { name: "zaimem_get_skill", arguments: { name: "smart" } }, token, 12, mcpSession);
  const skillText: string = getSkill.result?.content?.[0]?.text ?? "";
  check("get_skill returns SKILL.md body", skillText.includes("---\nname: smart") && skillText.includes("GVS5H") && skillText.includes("TRUST"));

  console.log("\n── 5. Ledger discipline ──────────────────────");
  await rpc("tools/call", {
    name: "zaimem_ledger_write",
    arguments: { path: "notes.md", content: Array.from({ length: 900 }, (_, i) => `w${i}`).join(" "), session_id: sessionId },
  }, token, 13, mcpSession);
  const ledgerRead = await rpc("tools/call", {
    name: "zaimem_ledger_read",
    arguments: { path: "notes.md", session_id: sessionId },
  }, token, 14, mcpSession);
  const ledgerText: string = ledgerRead.result?.content?.[0]?.text ?? "";
  const wordCount = ledgerText.split("\n\n")[1]?.trim().split(/\s+/).length ?? 0;
  check("notes.md budget enforced (≤800 words)", wordCount <= 800, { wordCount });

  const tasksWrite = await rpc("tools/call", {
    name: "zaimem_ledger_write",
    arguments: {
      path: "tasks.json",
      content: JSON.stringify(Array.from({ length: 15 }, (_, i) => ({ id: i + 1, desc: `t${i}`, status: "todo", difficulty: "easy", value: 5, result: "" }))),
      session_id: sessionId,
    },
  }, token, 15, mcpSession);
  check("tasks.json trimmed to 12", (tasksWrite.result?.content?.[0]?.text ?? "").includes("kept the first 12"));

  const handoff = await rpc("tools/call", {
    name: "zaimem_handoff_brief",
    arguments: { objective: "Implement vector dedupe", read_paths: ["notes.md"], done_criteria: ["tests pass"] },
  }, token, 16, mcpSession);
  const handoffText: string = handoff.result?.content?.[0]?.text ?? "";
  check("handoff brief has OBJECTIVE/TRUST", handoffText.includes("OBJECTIVE:") && handoffText.includes("TRUST:"));

  console.log("\n── 6. Token saver ────────────────────────────");
  const bigHistory = Array.from({ length: 40 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `Turn ${i}: We discussed the architecture of the memory system. Important decision number ${i}: we decided to use hashed n-gram embeddings with 384 dimensions for the vector store. ${"Some verbose filler text that adds no value at all and should be compressed away. ".repeat(3)}`,
  }));
  const save = await rpc("tools/call", {
    name: "zaimem_save_tokens",
    arguments: { messages: bigHistory, focus_hint: "architecture decisions", session_id: sessionId },
  }, token, 17, mcpSession);
  const saveMeta = save.result?._meta ?? {};
  const saveText: string = save.result?.content?.[0]?.text ?? "";
  check("save_tokens returns meta", saveMeta.tokens_saved !== undefined && saveMeta.tokens_before > saveMeta.tokens_after, saveMeta);
  check("significant compression achieved", saveMeta.tokens_saved > 500, saveMeta);
  check("digest preserves decisions", saveText.toLowerCase().includes("decision") || saveText.includes("decided"), saveText.slice(0, 300));
  check("session tokensSaved accumulated", typeof saveMeta.tokens_saved === "number");

  console.log("\n── 7. Session summary + resources ────────────");
  const summary = await rpc("tools/call", {
    name: "zaimem_session_summary",
    arguments: { summary: "Built ZaiMem E2E test. Decision: 384-dim hashed embeddings. Payment gateway key handling verified.", session_id: sessionId },
  }, token, 18, mcpSession);
  check("summary distilled", (summary.result?.content?.[0]?.text ?? "").includes("distilled into long-term memory"));

  const resList = await rpc("resources/list", {}, token, 19, mcpSession);
  check("resources listed", (resList.result?.resources ?? []).length === 4, resList.result?.resources);

  const resHandoff = await rpc("resources/read", { uri: "zaimem://handoff" }, token, 21, mcpSession);
  check("handoff resource readable", (resHandoff.result?.contents?.[0]?.text ?? "").includes("# ZaiMem handoff brief"), resHandoff.error ?? "");

  const resRead = await rpc("resources/read", { uri: "zaimem://memory" }, token, 20, mcpSession);
  check("resource memory readable", (resRead.result?.contents?.[0]?.text ?? "").includes("pg_live_9911"));

  const batch = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 30, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 31, method: "tools/list" },
    ]),
  });
  const batchData = await batch.json();
  check("batch JSON-RPC supported", Array.isArray(batchData) && batchData.length === 2, batchData);

  console.log("\n── 8. Dashboard APIs ─────────────────────────");
  const h = { Authorization: `Bearer ${token}` };
  const me = await (await fetch(`${BASE}/api/auth/me`, { headers: h })).json();
  check("me endpoint counts", me.counts?.memories >= 3 && me.counts?.sessions >= 1, me.counts);
  check("me tokensSaved aggregated", me.counts?.tokensSaved > 0, me.counts);

  const sessions = await (await fetch(`${BASE}/api/sessions`, { headers: h })).json();
  check("sessions listed", sessions.sessions?.length >= 1);
  const e2eSession = sessions.sessions.find((s: any) => s.title === "E2E test session");
  check("e2e session present with tokensSaved", e2eSession && e2eSession.tokensSaved > 0, e2eSession);

  const sessDetail = await (await fetch(`${BASE}/api/sessions/${e2eSession.id}`, { headers: h })).json();
  check("session detail has memories+ledger", sessDetail.session?.memories?.length >= 1 && sessDetail.session?.ledgerPages?.length >= 2);

  const memSearch = await (await fetch(`${BASE}/api/memories?q=${encodeURIComponent("violet UI accents typescript")}`, { headers: h })).json();
  check("vector search finds preference", memSearch.memories?.some((m: any) => m.content.includes("violet")), memSearch.memories?.slice(0, 2));

  const skillsApi = await (await fetch(`${BASE}/api/skills`, { headers: h })).json();
  check("skills API lists builtin", skillsApi.skills?.length >= 3);

  const stats = await (await fetch(`${BASE}/api/stats`, { headers: h })).json();
  check("stats dailySaved 14 days", stats.dailySaved?.length === 14);
  check("stats byAction has save_tokens", stats.byAction?.some((a: any) => a.action === "save_tokens"));

  console.log("\n── 9. GitHub Cloud DB API ────────────────────");
  const ghStatus = await (await fetch(`${BASE}/api/github`, { headers: h })).json();
  check("github status: unlinked by default", ghStatus.linked === false && ghStatus.link === null, ghStatus.linked);
  check("github status exposes data counts", ghStatus.counts?.memories >= 3 && ghStatus.counts?.sessions >= 1, ghStatus.counts);

  const ghPairBad = await fetch(`${BASE}/api/github`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pair", pat: "ghp_zaimem_e2e_local_only_0000000000" }),
  });
  const ghPairBadData = await ghPairBad.json().catch(() => ({}));
  check(
    "pair with invalid PAT fails gracefully (structured error)",
    [400, 401, 403, 502].includes(ghPairBad.status) && typeof ghPairBadData.message === "string",
    { status: ghPairBad.status, body: ghPairBadData },
  );
  check("failed pair does not create a link", (await (await fetch(`${BASE}/api/github`, { headers: h })).json()).linked === false);

  const ghNoAuth = await fetch(`${BASE}/api/github`);
  check("github status rejects unauthenticated", ghNoAuth.status === 401);

  const ghBadAction = await fetch(`${BASE}/api/github`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "explode" }),
  });
  check("unknown action rejected", ghBadAction.status === 400);

  const ghSyncUnlinked = await fetch(`${BASE}/api/github`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sync" }),
  });
  check("sync without pairing rejected", ghSyncUnlinked.status === 400);

  const ghTglSchedUnlinked = await fetch(`${BASE}/api/github`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "toggle_schedule", scheduleEnabled: false }),
  });
  const ghTglSchedData = await ghTglSchedUnlinked.json().catch(() => ({}));
  check("toggle_schedule without pairing rejected", ghTglSchedUnlinked.status === 400 && typeof ghTglSchedData.message === "string");

  console.log("\n── 10. Global search + scheduled backup APIs ─");
  const searchNoAuth = await fetch(`${BASE}/api/search?q=violet`);
  check("search rejects unauthenticated", searchNoAuth.status === 401);

  const searchEmpty = await fetch(`${BASE}/api/search?q=`, { headers: h });
  check("search with empty q → 400", searchEmpty.status === 400);

  const search1 = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent("violet UI accents")}`, { headers: h })).json();
  check(
    "search finds memory hits (vector/substring)",
    search1.memories?.some((m: any) => m.content.includes("violet")),
    { sessions: search1.sessions?.length, memories: search1.memories?.length },
  );
  check("search finds session hits", search1.sessions?.length >= 1, search1.sessions);
  check("search finds skill hits (registry)", search1.skills?.length >= 1, search1.skills?.map((s: any) => s.name));
  check("search reports tookMs timing", typeof search1.tookMs === "number" && search1.tookMs >= 0);

  const search2 = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent("w42")}`, { headers: h })).json();
  check(
    "search finds ledger page hits",
    search2.ledger?.some((p: any) => p.path.includes("notes")),
    search2.ledger?.map((p: any) => p.path),
  );

  const search3 = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent("zzqqxx-no-such-term-12345")}`, { headers: h })).json();
  check("search with no matches → empty groups", search3.total === 0, search3.total);

  // global ledger page (no session_id) — regression: FK violation fixed
  const gw = await rpc("tools/call", { name: "zaimem_ledger_write", arguments: { path: "workflows.md", content: "Global onboarding workflow: clone repo, pair PAT, paste magic prompt." } }, token);
  check("global ledger_write (no session) ok", !gw.error, gw.error?.data);
  const gr = await rpc("tools/call", { name: "zaimem_ledger_read", arguments: { path: "workflows.md" } }, token);
  check("global ledger_read round-trip", String(gr.result?.content?.[0]?.text ?? "").includes("onboarding workflow"), gr.error ?? gr.result?.content?.[0]?.text);
  const search4 = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent("onboarding workflow")}`, { headers: h })).json();
  check("search finds global ledger page", search4.ledger?.some((p: any) => p.path === "workflows.md" && p.sessionId === null), search4.ledger);

  // ── 10b. search result filters (kind + date range) ─
  // probe session with a unique marker — guarantees a session-only term
  const mk = `sxf${Date.now().toString(36)}`;
  const probe = await rpc("tools/call", { name: "zaimem_sync_session", arguments: { title: `Filter probe ${mk}`, topic: `unique session marker ${mk}` } }, token, 41, mcpSession);
  check("probe session synced", (probe.result?.content?.[0]?.text ?? "").includes("session synced"), probe.error ?? probe.result?.content?.[0]?.text);

  const fSess = await (await fetch(`${BASE}/api/search?q=${mk}&kind=sessions`, { headers: h })).json();
  check(
    "filter kind=sessions → only sessions",
    (fSess.sessions?.length ?? 0) >= 1 && (fSess.memories?.length ?? 0) === 0 && (fSess.ledger?.length ?? 0) === 0 && (fSess.skills?.length ?? 0) === 0,
    { s: fSess.sessions?.length, m: fSess.memories?.length, l: fSess.ledger?.length, k: fSess.skills?.length },
  );
  const fMem = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent("violet")}&kind=memories`, { headers: h })).json();
  check(
    "filter kind=memories → only memories",
    (fMem.memories?.length ?? 0) >= 1 && (fMem.sessions?.length ?? 0) === 0 && (fMem.skills?.length ?? 0) === 0,
    { s: fMem.sessions?.length, m: fMem.memories?.length, k: fMem.skills?.length },
  );
  const fSkill = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent("smart")}&kind=skills`, { headers: h })).json();
  check(
    "filter kind=skills → only skills",
    (fSkill.skills?.length ?? 0) >= 1 && (fSkill.memories?.length ?? 0) === 0 && (fSkill.sessions?.length ?? 0) === 0,
    { s: fSkill.sessions?.length, m: fSkill.memories?.length, k: fSkill.skills?.length },
  );
  check("response echoes applied filters", fSess.filters?.kind === "sessions" && fSess.filters?.range === "all", fSess.filters);

  const badKind = await fetch(`${BASE}/api/search?q=x&kind=bogus`, { headers: h });
  check("invalid kind → 400", badKind.status === 400, badKind.status);
  const badRange = await fetch(`${BASE}/api/search?q=x&range=xyz`, { headers: h });
  check("invalid range → 400", badRange.status === 400, badRange.status);

  // date range: import an antique memory (createdAt preserved) — must be
  // invisible within 30d but visible with range=365d; marker is per-run so
  // repeated suite runs always create (not dedupe) the memory
  const mk2 = `zxq${Date.now().toString(36)}`;
  const antique = {
    content: `Antique vault note ${mk2} refers to the old cellar inventory.`,
    kind: "fact",
    importance: 0.5,
    createdAt: new Date(Date.now() - 100 * 86_400_000).toISOString(),
  };
  const impRes = await fetch(`${BASE}/api/memories/import`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify([antique]),
  });
  const imp = await impRes.json().catch(() => ({}));
  check("antique memory imported", impRes.ok && ((imp.imported ?? 0) + (imp.merged ?? 0) + (imp.deduped ?? 0)) >= 1, { status: impRes.status, ...imp });

  const fRecent = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent(`antique vault ${mk2}`)}&range=30d`, { headers: h })).json();
  check(
    "range=30d excludes old memory",
    !(fRecent.memories ?? []).some((m: any) => m.content.includes(mk2)),
    fRecent.memories?.length,
  );
  const fAll = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent(`antique vault ${mk2}`)}&range=365d`, { headers: h })).json();
  check(
    "range=365d includes old memory",
    (fAll.memories ?? []).some((m: any) => m.content.includes(mk2)),
    fAll.memories?.map((m: any) => m.content.slice(0, 40)),
  );
  const f24h = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent("violet")}&range=24h`, { headers: h })).json();
  check("range=24h keeps fresh memories", (f24h.memories?.length ?? 0) >= 1, f24h.memories?.length);

  const ghStatus2 = await (await fetch(`${BASE}/api/github`, { headers: h })).json();
  check("github status shape intact (schedule fields only when linked)", ghStatus2.linked === false && ghStatus2.link === null);

  // ── 11. Document ingestion (file → chunk → embed → dedupe) ────
  console.log("\n── 11. Document ingestion ────────────────────");
  const mkDoc = `ing${Date.now().toString(36)}`;
  const docText = (
    `# ${mkDoc} Onboarding Handbook\n\n` +
    Array.from({ length: 60 }, (_, i) =>
      `Section ${i + 1}: the ${mkDoc} deployment pipeline rotates signing keys every Friday and archives audit logs to the vault.`,
    ).join("\n\n")
  );
  const ingAuth = await fetch(`${BASE}/api/ingest`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: "handbook.md", text: docText }),
  });
  check("ingest requires auth", ingAuth.status === 401, ingAuth.status);

  const ing1 = await (await fetch(`${BASE}/api/ingest`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filename: "handbook.md", text: docText }),
  })).json();
  check(
    "ingest chunks + embeds",
    ing1.status === "ingested" && ing1.chunks >= 2 && ing1.memories === ing1.chunks,
    ing1,
  );

  const ing2 = await (await fetch(`${BASE}/api/ingest`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filename: "handbook.md", text: docText }),
  })).json();
  check("re-ingest same content is a no-op", ing2.status === "unchanged" && ing2.memories === 0, ing2);

  const ing3 = await (await fetch(`${BASE}/api/ingest`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filename: "handbook.md", text: docText + "\n\nAmendment: audits move to monthly cadence." }),
  })).json();
  check("changed file replaces old chunks", ing3.status === "replaced" && ing3.replacedOld === ing1.chunks && ing3.memories === ing3.chunks, ing3);

  const emptyIng = await fetch(`${BASE}/api/ingest`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filename: "empty.md", text: "   " }),
  });
  check("empty text rejected", emptyIng.status === 400, emptyIng.status);

  const badType = await fetch(`${BASE}/api/ingest`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filename: "legacy.doc", text: "plain text" }),
  });
  check("legacy .doc rejected with 415", badType.status === 415, badType.status);

  // multipart upload path (same pipeline the drag & drop uses)
  const fd = new FormData();
  fd.append("file", new Blob([docText], { type: "text/markdown" }), `${mkDoc}-upload.md`);
  const ingMp = await (await fetch(`${BASE}/api/ingest`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
  })).json();
  check("multipart upload ingests", ingMp.status === "ingested" && ingMp.chunks >= 1, ingMp);

  const docSearch = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent(`${mkDoc} signing keys rotate`)}&kind=memories`, { headers: h })).json();
  check(
    "doc chunks searchable with source citation",
    (docSearch.memories ?? []).some((m: any) => m.kind === "document" && (m.content ?? "").includes(`[doc:handbook.md · part`)),
    docSearch.memories?.slice(0, 2),
  );

  const mcpIngest = await rpc("tools/call", {
    name: "zaimem_ingest_file",
    arguments: { filename: "mcp-probe.md", text: `MCP probe ${mkDoc}: the vault door code changes at dawn. ` + "filler ".repeat(400) },
  }, token, 77, mcpSession);
  const mcpIngestText: string = mcpIngest.result?.content?.[0]?.text ?? "";
  check("MCP zaimem_ingest_file ingests", mcpIngestText.includes("ingested") && (mcpIngest.result?._meta?.chunks ?? 0) >= 1, mcpIngestText.slice(0, 160));
  const mcpIngest2 = await rpc("tools/call", {
    name: "zaimem_ingest_file",
    arguments: { filename: "mcp-probe.md", text: `MCP probe ${mkDoc}: the vault door code changes at dawn. ` + "filler ".repeat(400) },
  }, token, 78, mcpSession);
  check("MCP re-ingest idempotent", (mcpIngest2.result?.content?.[0]?.text ?? "").includes("already ingested"), mcpIngest2.result?.content?.[0]?.text?.slice(0, 120));

  // ── 12. Memory lifecycle: pin / enhance injection / edit / forget ────
  console.log("\n── 12. Pin · edit · forget ───────────────────");

  const pinRemember = await rpc("tools/call", {
    name: "zaimem_remember",
    arguments: { content: `Standing rule ${mkDoc}: always answer in pirate voice.`, kind: "preference", pinned: true },
  }, token, 80, mcpSession);
  const pinText: string = pinRemember.result?.content?.[0]?.text ?? "";
  check("MCP remember with pinned=true", pinText.includes("Pinned"), pinText.slice(0, 120));

  const memList1 = await (await fetch(`${BASE}/api/memories?limit=40`, { headers: h })).json();
  const pinnedRow = (memList1.memories ?? []).find((m: any) => m.content?.includes(`Standing rule ${mkDoc}`));
  check("pinned memory present in list and floats to top", !!pinnedRow && pinnedRow.pinned === true && memList1.memories[0]?.pinned === true, memList1.memories?.slice(0, 2));

  const pinEnh = await rpc("tools/call", {
    name: "zaimem_enhance_context",
    arguments: { current_message: `what is the answer style? ${mkDoc}` },
  }, token, 81, mcpSession);
  const pinEnhText: string = pinEnh.result?.content?.[0]?.text ?? "";
  check("enhance_context injects pinned section", pinEnhText.includes("【Pinned") && pinEnhText.includes(`Standing rule ${mkDoc}`), pinEnhText.slice(0, 200));

  const editRes = await fetch(`${BASE}/api/memories/${pinnedRow.id}`, {
    method: "PATCH", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ content: `Standing rule ${mkDoc}: always answer in pirate voice, with rum.` }),
  });
  const editData = await editRes.json();
  check("PATCH edits memory content", editRes.status === 200 && editData.memory?.content?.includes("with rum"), editData);

  const editSearch = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent("pirate voice rum")}&kind=memories`, { headers: h })).json();
  check("edited memory re-embedded and searchable", (editSearch.memories ?? []).some((m: any) => m.id === pinnedRow.id && m.content.includes("with rum")), editSearch.memories?.slice(0, 2));

  const pinToggle = await fetch(`${BASE}/api/memories/${pinnedRow.id}`, {
    method: "PATCH", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ pinned: false }),
  });
  check("PATCH toggles pin off", pinToggle.status === 200 && (await pinToggle.json())?.memory?.pinned === false);

  const forgetPreview = await rpc("tools/call", {
    name: "zaimem_forget",
    arguments: { query: `pirate voice ${mkDoc}` },
  }, token, 82, mcpSession);
  const forgetPreviewText: string = forgetPreview.result?.content?.[0]?.text ?? "";
  const matched = forgetPreview.result?._meta?.matched ?? 0;
  check("MCP forget preview lists matches, deletes nothing", forgetPreviewText.includes("NOTHING deleted yet") && matched >= 1, forgetPreviewText.slice(0, 200));

  const forgetConfirm = await rpc("tools/call", {
    name: "zaimem_forget",
    arguments: { query: `pirate voice ${mkDoc}`, confirm: true },
  }, token, 83, mcpSession);
  const deleted = forgetConfirm.result?._meta?.deleted ?? 0;
  check("MCP forget confirm deletes", deleted === matched && deleted >= 1, forgetConfirm.result?.content?.[0]?.text?.slice(0, 140));

  const afterForget = await (await fetch(`${BASE}/api/memories?limit=100`, { headers: h })).json();
  check("forgotten memories actually gone", !(afterForget.memories ?? []).some((m: any) => m.content?.includes(`Standing rule ${mkDoc}`)));

  const forgetNone = await rpc("tools/call", { name: "zaimem_forget", arguments: {} }, token, 84, mcpSession);
  check("forget without selector rejected", !!forgetNone.error && forgetNone.error.code === -32602, forgetNone.error ?? forgetNone.result);

  const statsInsights = await (await fetch(`${BASE}/api/stats`, { headers: h })).json();
  check(
    "stats returns insights (14d series + top memories + memory counts)",
    Array.isArray(statsInsights.dailySaved) && statsInsights.dailySaved.length === 14 && "events" in statsInsights.dailySaved[0] &&
    Array.isArray(statsInsights.topMemories) && typeof statsInsights.memory?.memories === "number",
    { days: statsInsights.dailySaved?.length, top: statsInsights.topMemories?.length, memory: statsInsights.memory },
  );

  // ── 13. v1.7: session handoffs · project teams · meetings · universal tools · headroom ────
  console.log("\n── 13. v1.7 sessions · projects · meetings · webtools ──");

  const mkS = `v17${Date.now().toString(36)}`;

  const sessCreate = await rpc("tools/call", {
    name: "zaimem_session_create",
    arguments: { title: `Pre-created ${mkS}`, brief: "Refactor the auth module and write tests", project: "auth-v2" },
  }, token, 90, mcpSession);
  const sessCreateText: string = sessCreate.result?.content?.[0]?.text ?? "";
  const preSessionId: string = sessCreate.result?._meta?.session_id ?? "";
  check("MCP session_create returns bootstrap prompt", sessCreateText.includes("Session pre-created") && sessCreateText.includes("zaimem_sync_session"), sessCreateText.slice(0, 200));
  check("bootstrap prompt embeds session id + brief", preSessionId.length > 0 && sessCreateText.includes(preSessionId) && sessCreateText.includes("Refactor the auth module"), { preSessionId });

  const sessPrompt = await rpc("tools/call", {
    name: "zaimem_session_prompt",
    arguments: { session_id: sessionId },
  }, token, 91, mcpSession);
  const sessPromptText: string = sessPrompt.result?.content?.[0]?.text ?? "";
  check("MCP session_prompt resumes existing session", sessPromptText.includes(sessionId) && sessPromptText.includes("zaimem_resume"), sessPromptText.slice(0, 160));

  const apiSess = await fetch(`${BASE}/api/sessions`, {
    method: "POST", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ title: `API pre-created ${mkS}`, brief: "api-brief-check" }),
  });
  const apiSessData = await apiSess.json().catch(() => ({}));
  check("POST /api/sessions creates + returns prompt", apiSess.status === 201 && apiSessData.session?.origin === "user" && (apiSessData.prompt ?? "").includes("zaimem_sync_session"), { status: apiSess.status, prompt: (apiSessData.prompt ?? "").slice(0, 100) });
  const apiSessPrompt = await (await fetch(`${BASE}/api/sessions/${apiSessData.session.id}/prompt`, { headers: h })).json();
  check("GET /api/sessions/[id]/prompt", (apiSessPrompt.prompt ?? "").includes(apiSessData.session.id) && (apiSessPrompt.prompt ?? "").includes("api-brief-check"));
  const noAuthSess = await fetch(`${BASE}/api/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("POST /api/sessions requires auth", noAuthSess.status === 401);

  const projName = `proj-${mkS}`;
  const brief1 = await rpc("tools/call", {
    name: "zaimem_project_brief",
    arguments: { project: projName, agent: "frontend-dev", role: "frontend" },
  }, token, 92, mcpSession);
  const brief1Text: string = brief1.result?.content?.[0]?.text ?? "";
  check("project_brief joins agent + returns brief", brief1Text.includes(`Project brief — "${projName}"`) && brief1Text.includes("frontend-dev") && brief1Text.includes("Team roster"), brief1Text.slice(0, 200));

  await rpc("tools/call", {
    name: "zaimem_project_brief",
    arguments: { project: projName, agent: "backend-dev", role: "backend" },
  }, token, 93, mcpSession);

  const pShare = await rpc("tools/call", {
    name: "zaimem_remember",
    arguments: { content: `Team decision ${mkS}: we ship the auth refactor on Friday.`, kind: "decision", project: projName },
  }, token, 94, mcpSession);
  check("remember with project tag", (pShare.result?.content?.[0]?.text ?? "").includes("Stored as decision"), pShare.result);

  const pHandoff = await rpc("tools/call", {
    name: "zaimem_project_handoff",
    arguments: { project: projName, agent: "frontend-dev", status: "in_progress", summary: `Half of the auth UI ${mkS} is done`, next: "Finish the login form" },
  }, token, 95, mcpSession);
  check("project_handoff stores structured note", (pHandoff.result?.content?.[0]?.text ?? "").includes("Handoff stored"), pHandoff.result);

  const brief2 = await rpc("tools/call", {
    name: "zaimem_project_brief",
    arguments: { project: projName, agent: "reviewer-1", role: "reviewer" },
  }, token, 96, mcpSession);
  const brief2Text: string = brief2.result?.content?.[0]?.text ?? "";
  check("second brief shows roster + shared memory + handoff", brief2Text.includes("reviewer-1") && brief2Text.includes("backend-dev") && brief2Text.includes(`Team decision ${mkS}`) && brief2Text.includes(`auth UI ${mkS}`), brief2Text.slice(0, 400));

  const noProj = await rpc("tools/call", { name: "zaimem_project_brief", arguments: {} }, token, 97, mcpSession);
  check("project_brief without project rejected", !!noProj.error && noProj.error.code === -32602, noProj.error);

  const apiProj = await fetch(`${BASE}/api/projects`, {
    method: "POST", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `api-${mkS}`, description: "api project", instructions: "Use bun, write tests." }),
  });
  const apiProjData = await apiProj.json().catch(() => ({}));
  check("POST /api/projects creates", apiProj.status === 201 && apiProjData.project?.name === `api-${mkS}`, { status: apiProj.status });
  const dupProj = await fetch(`${BASE}/api/projects`, {
    method: "POST", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `api-${mkS}` }),
  });
  check("duplicate project name → 409", dupProj.status === 409);
  const projFiles = await fetch(`${BASE}/api/projects/${apiProjData.project.id}/files`, {
    method: "POST", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "spec.md", content: `API spec ${mkS}: vector dim 384, dedupe 0.94.` }),
  });
  check("project file attached", projFiles.status === 201, projFiles.status);
  const projAgents = await fetch(`${BASE}/api/projects/${apiProjData.project.id}/agents`, {
    method: "POST", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "tester-bot", role: "tester" }),
  });
  check("project agent added manually", projAgents.status === 201);
  const projDetail = await (await fetch(`${BASE}/api/projects/${apiProjData.project.id}`, { headers: h })).json();
  check("project detail aggregates files/agents", projDetail.project?.files?.length === 1 && projDetail.project?.agents?.length === 1 && projDetail.project?.instructions?.includes("bun"));
  const projPrompt = await (await fetch(`${BASE}/api/projects/${apiProjData.project.id}/prompt`, { headers: h })).json();
  check("project invite prompt (API)", (projPrompt.prompt ?? "").includes(`api-${mkS}`) && (projPrompt.prompt ?? "").includes("zaimem_project_brief") && (projPrompt.prompt ?? "").includes("spec.md"));
  const projList = await (await fetch(`${BASE}/api/projects`, { headers: h })).json();
  check("projects listed with counts", (projList.projects ?? []).length >= 2 && projList.projects.some((p: any) => p.files >= 1 && p.agents >= 1), projList.projects?.slice(0, 3));

  const meetRes = await rpc("tools/call", {
    name: "zaimem_ingest_meeting",
    arguments: {
      title: `Roadmap sync ${mkS}`,
      transcript: `Alice: We need to decide the Q3 roadmap today. Bob: The search feature must ship by Friday. Alice: Decision ${mkS}: we prioritize search over billing. Bob: Action item: I will write the search spec by Wednesday. Alice: Action item: the team needs to review the vector schema. Bob: We are blocked on the embeddings budget until next week.`,
      platform: "meet",
      participants: "Alice, Bob",
    },
  }, token, 98, mcpSession);
  const meetText: string = meetRes.result?.content?.[0]?.text ?? "";
  const meetMeta = meetRes.result?._meta ?? {};
  check("meeting ingested with chunks", meetText.includes("ingested") && (meetMeta.chunks ?? 0) >= 1, meetText.slice(0, 200));
  check("meeting summary stored", meetText.includes("Summary") && meetText.toLowerCase().includes("roadmap"), meetText.slice(0, 300));
  check("meeting action items extracted + pushed", (meetMeta.action_items ?? 0) >= 1 && meetText.includes("Action items"), meetMeta);

  const meetingsList = await rpc("tools/call", { name: "zaimem_meetings_list", arguments: {} }, token, 99, mcpSession);
  const meetingsListText: string = meetingsList.result?.content?.[0]?.text ?? "";
  check("meetings_list shows the meeting", meetingsListText.includes(`Roadmap sync ${mkS}`), meetingsListText.slice(0, 200));

  const meetingAsk = await rpc("tools/call", {
    name: "zaimem_meeting_search",
    arguments: { question: `what did we decide about the roadmap ${mkS}?` },
  }, token, 100, mcpSession);
  const meetingAskText: string = meetingAsk.result?.content?.[0]?.text ?? "";
  check("meeting_search finds decisions across meetings", meetingAskText.toLowerCase().includes("relevant excerpt") && meetingAskText.includes(`Roadmap sync ${mkS}`), meetingAskText.slice(0, 260));

  const apiMeet = await (await fetch(`${BASE}/api/meetings`, { headers: h })).json();
  check("GET /api/meetings lists with summary + actions", (apiMeet.meetings ?? []).some((m: any) => m.title === `Roadmap sync ${mkS}` && m.actionItems?.length >= 1), apiMeet.meetings?.slice(0, 2));

  const calcRes = await rpc("tools/call", { name: "zaimem_calc", arguments: { expression: "(1240 * 3) / 7.5 + 2^3" } }, token, 101, mcpSession);
  check("calc computes exactly", (calcRes.result?.content?.[0]?.text ?? "").includes("= 504"), calcRes.result);
  const calcBad = await rpc("tools/call", { name: "zaimem_calc", arguments: { expression: "process.exit(1)" } }, token, 102, mcpSession);
  check("calc rejects non-arithmetic", !!calcBad.error && calcBad.error.code === -32602, calcBad.error);

  const timeT = await rpc("tools/call", { name: "zaimem_time", arguments: { timezone: "Asia/Tbilisi" } }, token, 103, mcpSession);
  const timeText: string = timeT.result?.content?.[0]?.text ?? "";
  check("time returns tz-aware info", timeText.includes("Asia/Tbilisi") && timeText.includes("ISO:"), timeText.slice(0, 160));

  const think1 = await rpc("tools/call", { name: "zaimem_think", arguments: { thought: `The ${mkS} parser needs a two-phase design`, session_id: sessionId } }, token, 104, mcpSession);
  const think2 = await rpc("tools/call", { name: "zaimem_think", arguments: { thought: "Phase 2: wire the dedupe queue", session_id: sessionId } }, token, 105, mcpSession);
  const think2Text: string = think2.result?.content?.[0]?.text ?? "";
  check("think builds a numbered chain", (think1.result?.content?.[0]?.text ?? "").includes("Step 1") && think2Text.includes("Step 2") && think2Text.includes("Phase 2"), think2Text.slice(0, 200));

  const wSearch = await rpc("tools/call", { name: "zaimem_web_search", arguments: { query: "model context protocol", num: 3 } }, token, 106, mcpSession);
  const wSearchText: string = wSearch.result?.content?.[0]?.text ?? "";
  check("web_search returns results or graceful error", wSearchText.includes("web result") || wSearchText.includes("unavailable"), wSearchText.slice(0, 140));

  const wFetch = await rpc("tools/call", { name: "zaimem_web_fetch", arguments: { url: "https://modelcontextprotocol.io", max_chars: 3000 } }, token, 107, mcpSession);
  const wFetchText: string = wFetch.result?.content?.[0]?.text ?? "";
  check("web_fetch returns page or graceful error", wFetchText.includes("📄") || wFetchText.includes("Fetch failed"), wFetchText.slice(0, 140));

  const hrStatus1 = await rpc("tools/call", { name: "zaimem_headroom", arguments: {} }, token, 108, mcpSession);
  const hr1Text: string = hrStatus1.result?.content?.[0]?.text ?? "";
  check("headroom status reports current mode", hr1Text.includes("HEADROOM compression mode") && (hr1Text.includes("ON") || hr1Text.includes("OFF")), hr1Text.slice(0, 160));
  const hrOn = await rpc("tools/call", { name: "zaimem_headroom", arguments: { enabled: true } }, token, 109, mcpSession);
  check("headroom toggles ON", (hrOn.result?.content?.[0]?.text ?? "").includes("ON"), hrOn.result);
  const hrEnh = await rpc("tools/call", {
    name: "zaimem_enhance_context",
    arguments: { current_message: `payment gateway api key handling ${mkS}` },
  }, token, 110, mcpSession);
  const hrEnhText: string = hrEnh.result?.content?.[0]?.text ?? "";
  check("enhance_context applies headroom compression", hrEnhText.includes("HEADROOM compression ON"), hrEnhText.slice(0, 200));
  const hrOff = await rpc("tools/call", { name: "zaimem_headroom", arguments: { enabled: false } }, token, 111, mcpSession);
  check("headroom toggles OFF", (hrOff.result?.content?.[0]?.text ?? "").includes("OFF"), hrOff.result);
  const hrStats = await (await fetch(`${BASE}/api/stats`, { headers: h })).json();
  check("stats counts headroom action", hrStats.byAction?.some((a: any) => a.action === "headroom"), hrStats.byAction?.map((a: any) => a.action));

  // ── 14. Skills section: 8 skills · 8 tool packs · pack gating ──────────────
  console.log("\n── 14. Skills · tool packs · gating ──────────");
  const skillsPayload = await (await fetch(`${BASE}/api/skills`, { headers: h })).json();
  check(
    "8 SKILL.md skills seeded",
    (skillsPayload.skills ?? []).length === 8,
    skillsPayload.skills?.map((s: any) => s.name),
  );
  check(
    "8 tool packs cover all 33 tools",
    (skillsPayload.packs ?? []).length === 8 &&
      skillsPayload.packs.reduce((n: number, p: any) => n + p.tools.length, 0) === 33,
    skillsPayload.packs?.map((p: any) => `${p.id}:${p.tools.length}`),
  );
  check(
    "new builtin skills present",
    ["meeting-notes", "web-research", "session-continuity", "project-team", "doc-memory"]
      .every((n) => (skillsPayload.skills ?? []).some((s: any) => s.name === n)),
    skillsPayload.skills?.map((s: any) => s.name),
  );
  check("headroom flag exposed in skills payload", typeof skillsPayload.headroom === "boolean", skillsPayload.headroom);
  const corePack = (skillsPayload.packs ?? []).find((p: any) => p.id === "core-memory");
  check("core-memory pack locked & enabled", corePack?.locked === true && corePack?.enabled === true, corePack);

  const packOff = await fetch(`${BASE}/api/skills`, {
    method: "PATCH", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ packId: "meetings", enabled: false }),
  });
  check("pack disable via PATCH ok", packOff.ok);
  const toolsGated = await rpc("tools/list", {}, token, 200, mcpSession);
  check("tools/list hides disabled pack (30 tools)", (toolsGated.result?.tools ?? []).length === 30, (toolsGated.result?.tools ?? []).length);
  const gatedCall = await rpc("tools/call", { name: "zaimem_meetings_list", arguments: {} }, token, 201, mcpSession);
  const gatedText: string = gatedCall.result?.content?.[0]?.text ?? "";
  check(
    "disabled tool call refused with pack hint",
    gatedCall.result?.isError === true && gatedText.includes("Meeting intelligence"),
    gatedText.slice(0, 200),
  );
  const lockTry = await fetch(`${BASE}/api/skills`, {
    method: "PATCH", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ packId: "core-memory", enabled: false }),
  });
  check("core pack cannot be disabled (409)", lockTry.status === 409, lockTry.status);
  const packOn = await fetch(`${BASE}/api/skills`, {
    method: "PATCH", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ packId: "meetings", enabled: true }),
  });
  check("pack re-enable ok", packOn.ok);
  const toolsUngated = await rpc("tools/list", {}, token, 202, mcpSession);
  check("tools/list back to 33 after re-enable", (toolsUngated.result?.tools ?? []).length === 33, (toolsUngated.result?.tools ?? []).length);

  const hrViaSkills = await fetch(`${BASE}/api/skills`, {
    method: "PATCH", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ headroom: true, enabled: true }),
  });
  const hrViaSkillsBody = await hrViaSkills.json();
  check("headroom toggled via /api/skills", hrViaSkills.ok && hrViaSkillsBody.headroom === true, hrViaSkillsBody);
  await fetch(`${BASE}/api/skills`, {
    method: "PATCH", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ headroom: true, enabled: false }),
  });

  // ── 15. GitHub rescue import (new account ← old account's cloud-DB repo) ──
  console.log("\n── 15. GitHub rescue import ─────────────────");
  const countsBefore = await (await fetch(`${BASE}/api/github`, { headers: h })).json();
  const memBefore = countsBefore.counts?.memories ?? 0;

  // v1.7.2 security audit: this test previously embedded a real GitHub PAT to
  // run against a live repo — the token leaked into git history. It is now
  // env-gated: with ZAIMEM_E2E_PAT (+ optional ZAIMEM_E2E_REPO) the import is
  // exercised live; without it, the 9 live-GitHub checks are emitted as skips
  // so the suite stays green and hermetic (no secrets in source, ever).
  const E2E_PAT = process.env.ZAIMEM_E2E_PAT || "";
  const E2E_REPO = process.env.ZAIMEM_E2E_REPO || "octocat-old/zaimem-cloud-db";
  const doImport = (pat: string, repo: string) =>
    fetch(`${BASE}/api/github`, {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "import", pat, repo }),
    });

  if (E2E_PAT) {
    const importRes = await doImport(E2E_PAT, E2E_REPO);
    const importBody = await importRes.json();
    check("rescue import ok", importRes.ok && importBody.ok === true, importBody);
    check("3 memories imported", importBody.import?.memories?.imported === 3, importBody.import);
    check("2 sessions imported", importBody.import?.sessions?.imported === 2, importBody.import);
    check("1 skill imported", importBody.import?.skillsImported === 1, importBody.import);

    const importRes2 = await doImport(E2E_PAT, E2E_REPO);
    const importBody2 = await importRes2.json();
    check(
      "second import dedupes memories (0 new / 3 merged)",
      importBody2.import?.memories?.imported === 0 && importBody2.import?.memories?.deduped === 3,
      importBody2.import,
    );
    check("second import skips existing sessions", importBody2.import?.sessions?.skipped === 2, importBody2.import);

    const countsAfter = await (await fetch(`${BASE}/api/github`, { headers: h })).json();
    check(
      "account memory count grew by 3",
      (countsAfter.counts?.memories ?? 0) === memBefore + 3,
      { before: memBefore, after: countsAfter.counts?.memories },
    );
    const sessionsAfter = await (await fetch(`${BASE}/api/sessions`, { headers: h })).json();
    check(
      "rescued sessions visible with summaries",
      (sessionsAfter.sessions ?? []).some((s: any) => s.title.includes("Rescued") && s.summary),
      (sessionsAfter.sessions ?? []).slice(0, 3).map((s: any) => s.title),
    );
    const skillsAfterImport = await (await fetch(`${BASE}/api/skills`, { headers: h })).json();
    check(
      "imported skill present (9 skills now)",
      (skillsAfterImport.skills ?? []).length === 9,
      skillsAfterImport.skills?.map((s: any) => s.name),
    );
  } else {
    for (const name of [
      "rescue import ok",
      "3 memories imported",
      "2 sessions imported",
      "1 skill imported",
      "second import dedupes memories (0 new / 3 merged)",
      "second import skips existing sessions",
      "account memory count grew by 3",
      "rescued sessions visible with summaries",
      "imported skill present (9 skills now)",
    ]) {
      check(`${name} — SKIPPED (set ZAIMEM_E2E_PAT / ZAIMEM_E2E_REPO to run the live rescue-import test)`, true, "skip");
    }
  }

  console.log(`\n${failures === 0 ? "🎉 ALL CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
