# Changelog

All notable changes to ZaiMem are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is semver.

## [1.7.1] — Skills section: tool packs, Headroom card & one-PAT account rescue

### Added
- **MCP tool packs — all 33 tools grouped into 8 per-user on/off packs**
  - New `ToolPackPref` model + `src/lib/zaimem/tool-packs.ts` registry: `core-memory` (locked, always on), session continuity, project agent teams, meeting intelligence, document ingestion, web & utilities, smart skills & ledger, token saver & headroom.
  - The MCP server filters `tools/list` by the user's pack prefs and refuses `tools/call` for disabled packs with a clear re-enable hint — agents only see the capability groups their human allows.
  - Dashboard **Skills** tab: new "MCP tool packs" group with per-pack switches, icons, tool chips and counts.
  - `GET /api/skills` now returns `{skills, packs, headroom}`; `PATCH /api/skills` accepts `{packId, enabled}` (locked packs answer 409).
- **Headroom card in the Skills section** — the compression mode now also lives where the skills do: dedicated card at the top of the Skills tab, same `User.headroom` setting as the header switch, `PATCH /api/settings` and the `zaimem_headroom` MCP tool.
- **5 new builtin skills (3 → 8)** — `meeting-notes`, `web-research`, `session-continuity`, `project-team`, `doc-memory`: SKILL.md protocols wiring the matching MCP tool groups into agent behavior. Seeded idempotently for existing accounts (on MCP initialize, login, and every Skills-tab load).
- **One-PAT account rescue (GitHub re-sync)** — fresh token / brand-new account, but the old ZaiMem already mirrored everything to a private GitHub repo?
  - New `POST /api/github {action: "import", pat, repo, branch?}` pulls the old cloud-DB repo into the current account: memories re-imported through the dedupe engine (idempotent — safe to run twice), `sessions/*.json` restored as session shells with titles/summaries/counters, and `skills.json` entries the account lacks are added (source: `imported`).
  - Pairing is NOT required — only repo + PAT. Fully additive; nothing in the current account is deleted or overwritten.
  - Dashboard Cloud DB tab: "New account? Re-sync your old ZaiMem from GitHub" card (repo, PAT, optional branch) + sync-log labels for `import` / `restore`.
- Landing "everything included" inventory updated (tool packs, 8 skills, one-PAT rescue, point-in-time restore, tool-pack gating); dashboard footer mentions the packs and rescue flow.
- e2e suite: section 14 (pack gating — tools/list 33 → 30 → refused call with pack hint → 33, locked-pack 409, headroom toggle via `/api/skills`) and section 15 (rescue import against an in-suite mock GitHub API: import → second-run dedupe → memory-count delta → rescued sessions visible → imported skill). **150/150 checks green.**

## [1.7.0] — Sessions, Project Teams, Meetings, Universal Tools & HEADROOM

### Added
- **Pre-created sessions & session handoffs**
  - `origin` (`agent` | `user`) + `brief` on sessions: pre-create a session with a title, brief and optional project namespace before any agent connects.
  - New MCP tools `zaimem_session_create` (returns the session id + a ready-to-paste bootstrap prompt) and `zaimem_session_prompt` (bootstrap prompt for any existing session, including auto-created ones).
  - Dashboard Sessions tab: pre-create form; per-session **Continue elsewhere** action; every prompt bakes in the session id, brief, last digest, key memories, open tasks and the MCP connection block.
  - APIs: `POST /api/sessions`, `PATCH /api/sessions/[id]`, `GET /api/sessions/[id]/prompt`.
- **Projects — agent teams**
  - New models `Project`, `ProjectFile`, `ProjectAgent`. A project is a shared workspace: name, description, team instructions, attached text files/prompts, an agent roster and one shared memory namespace (`Memory.project` / `Session.project`).
  - New MCP tools: `zaimem_project_brief` (join + full team brief in one call: instructions, files, roster, latest shared memories, active sessions; auto-provisions the project namespace) and `zaimem_project_handoff` (structured end-of-shift note: status `done|in_progress|blocked`, summary, next step — stored into shared project memory).
  - APIs: `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/[id]`, `POST/DELETE /api/projects/[id]/files`, `POST/DELETE /api/projects/[id]/agents`, `GET /api/projects/[id]/prompt` (agent invite prompt).
  - Dashboard **Projects** tab: create/list projects, detail dialog with editable instructions, file attachments (paste or pick a text file), manual roster management (MCP-joined agents show a badge), invite-prompt modal, shared-memory feed.
- **Meeting intelligence (Tactiq-inspired, self-hosted)**
  - New MCP tools: `zaimem_ingest_meeting` (transcript → hash-deduped chunked memory with `meeting:<title>` source, LLM summary with deterministic fallback, action-item extraction with heuristic fallback, items pushed onto the global `tasks.json` board), `zaimem_meetings_list`, `zaimem_meeting_search` ("ask my meetings" semantic search across all transcripts + summaries).
  - APIs: `GET /api/meetings`, `POST /api/meetings`. Dashboard **Meetings** tab with ingest form (paste or load `.txt/.vtt/.srt`), meeting cards and a detail dialog with summary + action items.
- **Universal tools** (zero-API-key staples, memory-wired)
  - `zaimem_web_search` — web search through the built-in SDK.
  - `zaimem_web_fetch` — page_reader → clean text (JS-rendered pages), optional `ingest: true` to store the page as chunked, citable memory.
  - `zaimem_calc` — safe arithmetic (shunting-yard parser; `+ - * / % ^`, unary minus; letters rejected — no code execution).
  - `zaimem_time` — ISO/epoch/UTC/local in any IANA timezone, weekday, ISO week number.
  - `zaimem_think` — sequential-thinking scratchpad stored in the ledger (`reasoning.md`, session or global), append/revise steps, chain survives compaction and handoffs.
- **HEADROOM compression mode** (inspired by headroomlabs-ai/headroom)
  - Per-account toggle (`User.headroom`): dashboard header switch, `PATCH /api/settings`, or `zaimem_headroom {enabled: true|false}`.
  - When ON, `zaimem_enhance_context` compresses injections harder: shorter memory excerpts, digest capped, full skill protocol withheld (on-demand retrieval hint instead); originals stay full-fidelity in the store and remain retrievable (`zaimem_doc_read` / `zaimem_recall`).
  - Tokens freed are measured per request and banked per account (`UsageStat action="headroom"`); `zaimem_headroom` reports lifetime savings.
- **Universal-IDE positioning** — magic prompt, bootstrap/invite prompts, landing copy and metadata now address every MCP-capable agent (chat.z.ai, Claude Code, Cursor, Cline, Windsurf, Trae, Antigravity, zcode, Koda/Kiro, Pi, Grok, Codex/Gemini CLI…) with per-client connection hints in the magic prompt.
- **GitHub free-hosting promotion** — can't-miss dashboard banner (when unpaired) + landing band: private repo hosting is free, 3-step noob-friendly PAT setup, real-time auto-sync, storage offload from ZaiMem local storage, privacy notes (AES-256-GCM encrypted PAT, private repo, revocable).
- e2e suite: section 13 (22 checks) covering sessions/projects/meetings/webtools/headroom; tool-count assertion now 33. **129/129 checks green.**

### Fixed
- `src/app/api/github/route.ts`: duplicate `GET` export (compile-breaking) and missing `restoreFromSnapshot` import; history branch merged into the single `GET` handler.
- `zaimem_doc_read`: `estimateTokens` was called with a character count (string expected) → "~NaN tokens"; now joins chunk text.
- `search.ts`: `RecallHit` construction updated for the new required fields (`source`, `pinned`, `details`).
- `detectSkill` signature relaxed to the minimal `{ name, triggers }[]` registry shape it actually uses.
- Batch JSON-RPC narrowing (`RpcRequest[]`) typed explicitly; `Float64Array` vector typing aligned in `forgetMemories` / `searchMeetings`.
- e2e assertions refreshed for the v1.6.x additions that predated this release (20-tool list → 33, 4 resources, handoff resource read).

## [1.6.0] — Memory lifecycle & insights
- `zaimem_forget` two-phase deletion (preview → confirm) with AND-combined selectors (id / semantic query / kind / source / project / created-before).
- Pinned memories: always injected into `zaimem_enhance_context` (`【Pinned — always in force】`), +0.15 recall boost, dashboard pin toggle.
- Dashboard inline memory edit with instant re-embed + re-keywords.
- Stats insights: 14-day daily series (tokens saved + events), memory counts (total / pinned / documents), most-accessed memories.

## [1.5.0] — Document ingestion
- `zaimem_ingest_file` MCP tool + dashboard drag-and-drop upload (PDF via unpdf, DOCX via mammoth, TXT/MD/CSV/code).
- ~600-token overlapping chunks, 384-dim embedding per chunk, source citations `[doc:file · part i/N]`, sha256 hash-dedupe (same file → no-op, changed file → chunks replaced), progressive reading via `zaimem_doc_read`.

## [1.4.0] — Design & contrast
- Apple-style landing with animated feature demos; app-wide contrast fixes; reduced-motion safety.

## [1.3.0] — Search filters + GHCR
- Global-search result filters by kind and date range; GitHub Actions Docker publishing to `ghcr.io/romangalaxys10-spec/zaimem`.

## [1.2.0] — Scheduled backup + global search + Docker kit
- Scheduled daily backup (`ZAIMEM_BACKUP_HOURS`), ⌘K global search across sessions/memories/ledger/skills, Dockerfile + compose deployment kit, global ledger FK fix.

## [1.1.0] — GitHub Cloud DB
- Pair a GitHub PAT → private repo auto-created → sha-based idempotent auto-sync of all data with audit trail; PAT encrypted (AES-256-GCM).

## [1.0.0] — Initial release
- Token auth, MCP server (JSON-RPC 2.0 streamable HTTP), local 384-dim vector memory with dedupe/merge, context enhancer, token saver, smart-skill port (ledger, difficulty budgets, handoff briefs), dashboard.
