/**
 * ZaiMem end-to-end flow test — exercises the full user journey:
 * token issuance → login → MCP handshake → all 12 tools → dashboard APIs.
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
  check("12 tools listed", toolNames.length === 12, toolNames);
  check(
    "core tools present",
    ["zaimem_sync_session", "zaimem_remember", "zaimem_recall", "zaimem_enhance_context",
     "zaimem_save_tokens", "zaimem_detect_skill", "zaimem_list_skills", "zaimem_get_skill",
     "zaimem_ledger_write", "zaimem_ledger_read", "zaimem_session_summary", "zaimem_handoff_brief",
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
  check("resources listed", (resList.result?.resources ?? []).length === 3);

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
  check("stats dailySaved 7 days", stats.dailySaved?.length === 7);
  check("stats byAction has save_tokens", stats.byAction?.some((a: any) => a.action === "save_tokens"));

  console.log("\n── 9. GitHub Cloud DB API ────────────────────");
  const ghStatus = await (await fetch(`${BASE}/api/github`, { headers: h })).json();
  check("github status: unlinked by default", ghStatus.linked === false && ghStatus.link === null, ghStatus.linked);
  check("github status exposes data counts", ghStatus.counts?.memories >= 3 && ghStatus.counts?.sessions >= 1, ghStatus.counts);

  const ghPairBad = await fetch(`${BASE}/api/github`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pair", pat: "ghp_thisIsNotAValidTokenAtAll123456" }),
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

  console.log(`\n${failures === 0 ? "🎉 ALL CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
