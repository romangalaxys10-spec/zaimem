# Changelog

All notable changes to ZaiMem are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is semver.

## [1.8.3] — Fix Vercel runtime: schema bootstrap + per-instance DB truth

### Fixed
- **"Unexpected end of JSON input" on token generation (Vercel)**: runtime logs showed `P2021 — table main.User does not exist`. Root cause chain: (a) `output: "standalone"` made the Vercel builder skip the normal file trace, so Prisma's `libquery_engine-*.so.node` never reached the `.func` bundles — standalone is now opt-in via `NEXT_OUTPUT_MODE=standalone` (Dockerfile sets it; Vercel builds clean without it); (b) the lambda's `/tmp` SQLite starts EMPTY on cold start and the build-time `/tmp` is a different machine, so the schema never existed at runtime. `vercel-build.sh` now ships a schema-only `db/vercel-bootstrap.db` (generated fresh from the schema at build time) and `db.ts` copies it into place on cold start when the target file is missing.

### Changed
- **Scheduler off on Vercel**: the hourly GitHub-backup loop is a long-run-server feature; on ephemeral lambdas it only spammed per-instance errors (`instrumentation.ts` gates on `VERCEL`).
- **Functional sweep**: `scripts/vercel-smoke.sh` — 19 checks against production, split into HEALTH (stateless, must pass) and db-dep (state flows that need one shared database). Current run: **17 passed · 0 failed · 2 db-dependent**.

### Known limitation (by design of ephemeral infra)
- Every Vercel lambda instance owns its own `/tmp` database — state written on one instance is invisible to another (and all of it evaporates on cold starts). Health endpoints, auth bootstrap, search, skills, export, stats and all guards are green; multi-request state flows (ingest → search across calls, MCP sessions) stay consistent only within a warm instance. **Set `DATABASE_URL` to any managed Postgres** (Vercel dashboard → Storage → Create Database → name the env var `DATABASE_URL` → connect) and the build auto-switches to `prisma/schema.postgres.prisma` + `db push`, turning every db-dep check hard-green. The Storage provisioning API is not exposed to the current token scope, so this one click is user-side.

### Verified
- tsc clean; e2e green; production sweep 17/17 health + 0 hard failures; token generation returns a live `zm_…` key.

## [1.8.2] — Vercel hosting + GitHub auto-sync deploy pipeline

### Added
- **Vercel deployment pipeline**: `Vercel deploy` GitHub Actions workflow — on every push to `main` (and manual dispatch) it pulls the Vercel environment, builds with Bun + the project's `vercel-build` script, and ships a prebuilt production deployment. Repo secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) are stored encrypted via the Actions secrets API.
- **Dual-provider Prisma support**: `prisma/schema.postgres.prisma` (PostgreSQL variant of the SQLite schema) plus a conditional `vercel-build` script — when `DATABASE_URL` is a `postgres://` URL the Vercel build generates the Postgres client and runs `prisma db push` against it; otherwise it builds with the default SQLite schema. The codebase uses zero raw SQL, so the provider switch is fully portable.
- **Deployment docs**: new README "Deployment" section covering Vercel auto-sync, the database story, and the self-hosted/Docker reference mode.

### Hardened
- **Ephemeral-storage guard**: when running on Vercel with a `file:` SQLite URL, the server logs a loud warning on boot that all data is lost on cold start — no one can mistake a warm lambda instance for persistence.

### Notes
- Vercel functions expose an ephemeral filesystem, so the default `DATABASE_URL=file:/tmp/zaimem.db` persists only per instance. For production-grade persistence, point `DATABASE_URL` at any managed Postgres — the pipeline wires the schema automatically. In-memory rate-limit buckets and the MCP session registry are per-instance on serverless; MCP clients re-initialize transparently.
- Vercel's Storage provisioning API is not exposed to this token scope, so the database itself is a one-click add in the Vercel dashboard (Storage → Create Database → connect to `zaimem`).

### Verified
- tsc clean; e2e 156/156 green; first auto-deploy observed end-to-end from push → Actions → Vercel production (see README Deployment section).

## [1.8.1] — Embeddable dashboard (preview & IDE-panel fix)

### Fixed
- **Dashboard refused to render inside preview gateways / chat sidebars / IDE webview panels** ("open in dedicated browser"): v1.8.0's `Content-Security-Policy: frame-ancestors 'none'` plus `X-Frame-Options: SAMEORIGIN` blocked every iframe embedding, including trusted preview environments. Both directives removed; the remaining CSP stays self-locked (`default-src 'self'`, `object-src 'none'`, `upgrade-insecure-requests`) with HSTS, nosniff, Referrer-Policy, Permissions-Policy and COOP unchanged.

### Security note
- Framing is now open **by design**: ZaiMem holds **no cookies** — auth is a PAT sent via explicit `Authorization` headers, which browsers never attach cross-site. With no ambient credentials there is nothing for a clickjacking frame to hijack, so embeddability costs no real attack surface. (CSP `frame-ancestors` only matters where cookie sessions auto-attach; if cookie auth is ever introduced, revisit with an explicit allow-list.)

### Verified
- e2e **156 checks, all green**; GitHub engine suite 26 checks green; live header audit confirms the frame directives are gone while every other header is byte-identical to v1.8.0.

## [1.8.0] — Enterprise front page, onboarding, data export & hardening

### Changed
- **Landing page redesigned end-to-end — "enterprise instrument" school (Linear / Vercel / Stripe)**
  - One neutral near-black surface with hairline borders replaces the purple-glow-gradient look; a single violet accent is used surgically, other color is strictly semantic (emerald = success, amber = compression, rose = threat).
  - No gradient text, no ambient blur orbs, no rainbow cards; feature demos kept but restyled monochrome.
  - New sections: live key-numbers band (33 tools · 4 resources · 8 packs · 156 checks), real `mcp.json` setup block, agent wordmark strip (chat.z.ai, Claude Code, Cursor, Cline, Windsurf, Trae, Antigravity, zcode, Koda, Pi, Grok), dedicated Security section surfaced from the v1.7.2 audit, and a three-column enterprise footer.

### Added
- **Getting-started checklist** (dashboard): 4 steps with progress auto-detected from real signals (account created, first session, first memory, GitHub pairing); "Go" buttons jump to the right tab; dismissible; hides itself when complete.
- **Full-account JSON export**: `GET /api/export` streams one portable archive — memories, sessions, ledger pages, skills, tool-pack prefs and project teams with files & agents. No embedding vectors, no credentials; `Content-Disposition` download + one-click button in the Cloud DB tab.

### Hardened
- **Content-Security-Policy** on every response (self-locked, frame-ancestors none, object-src none) + **HSTS** — continues the v1.7.2 audit roadmap.
- **Strict type-checked builds**: `ignoreBuildErrors` removed — `next build` now fails on any TypeScript error (src/ verified clean via `tsc --noEmit`; sandbox-only folders excluded in tsconfig).

### Fixed
- **Restored two v1.7 API routes that were missing from the repository**: `GET /api/sessions/[id]/prompt` (bootstrap prompt for any session) and `GET /api/projects/[id]/prompt` (paste-ready project-team invite). e2e now guards both.
- e2e headroom stat check made deterministic (long `recent_history` guarantees compression frees tokens).
- Re-seeded `ZAIMEM_SECRET` documentation note: deployments must provide it or PAT encryption falls back to the legacy public key (server warns at startup).

### Verified
- e2e **156 checks, all green** (two consecutive runs); type-check clean; lint clean; browser-verified desktop + 390 px mobile (no horizontal scroll, zero console/page errors).

## [1.7.2] — Full security & cybersecurity audit, hardening

### Security — critical fixes
- **Leaked-PAT scrub (critical)**: two live GitHub PATs hard-coded in e2e scripts since v1.1 were replaced with local dummies; the rescue-import e2e is now env-gated (`ZAIMEM_E2E_PAT` / `ZAIMEM_E2E_REPO`) with 9 hermetic skips — no credentials ship in the repo. *Owner action required: revoke the two historical PATs in GitHub settings; optional history purge after revocation.*
- **PAT encryption key (critical)**: `ZAIMEM_SECRET` is now generated into `.env` and required; `decryptSecretUpgradable` + `loadPat` transparently re-encrypt legacy rows on load, and the server warns at startup if the secret is unset.
- **Plaintext token storage (high)**: API tokens are now stored as SHA-256 `tokenHash` (unique index); lazy migration + backfill script converted all existing rows; prompts rewired so tokens are supplied per-request and never read back.

### Security — hardening
- **Rate limiting (high)**: `/api/auth/init` 60 req / 5 min per IP; MCP endpoint 1200 req / min per token (`src/lib/zaimem/ratelimit.ts`).
- **JSON-RPC hardening (medium)**: batch requests capped at 25; MCP sessions evicted after 24 h idle (10 k cap); verbose error scrubbing on auth failures.
- **Security headers (low)**: HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options set in `next.config.ts`.
- Dependency audit triaged (30 advisories logged at scan time); upgrade roadmap for Next.js / next-auth / sharp documented in the audit report.

### Added
- **Security audit report tooling** — `scripts/sec-report-body.py`, `sec-report-charts.py`, `sec-report-merge.py` + report assets reproduce the 13-page v1.7.2 audit PDF (severity donut, area chart, findings tables, remediation log).
- e2e suite remains **150 checks, all green** (141 hard asserts + 9 env-gated live rescue-import checks).

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
