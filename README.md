# ZaiMem

[![License: MIT](https://img.shields.io/badge/License-MIT-10b981?style=flat-square)](./LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![MCP](https://img.shields.io/badge/Model%20Context-Protocol-8b5cf6?style=flat-square)](https://modelcontextprotocol.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-22c55e?style=flat-square)](https://github.com/romangalaxys10-spec/zaimem/pulls)

[![Built with GLM 5.3 Flash](https://img.shields.io/badge/Built_with-GLM_5.3_Flash-8b5cf6?style=for-the-badge)](https://z.ai/subscribe?ic=ROK78RJKNW)
[![Lead by Roman · Rommark.Dev](https://img.shields.io/badge/Lead_by-Roman_·_Rommark.Dev-f43f5e?style=for-the-badge)](https://rommark.dev)
[![Telegram Blog](https://img.shields.io/badge/Telegram-Blog-229ed9?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/VibeCodePrompterSystem)
[![The Claw Blog](https://img.shields.io/badge/The_Claw-Blog-10b981?style=for-the-badge)](https://claw.rommark.dev)
[![Author of Z-Assist Project](https://img.shields.io/badge/Author_of-Z--Assist_Project-f59e0b?style=for-the-badge)](https://zhelp.space-z.ai/)

<img src="docs/social-preview.png" alt="ZaiMem — session memory & context enhancer for chat.z.ai" width="100%" />

**Session memory & context enhancer for [chat.z.ai](https://chat.z.ai)** — an MCP-powered web service that gives any chat.z.ai agent persistent **vector memory**, automatic **context enhancement**, **token saving**, and **smart-skill orchestration** — with every user's data mirrored to their **own private GitHub repo** as a human-readable cloud database.

```
┌──────────────┐   1. visit    ┌───────────────────┐  2. auto private token
│  ZaiMem web  │ ────────────► │  token issued &   │ ────────────────────────┐
│     app      │               │  stored locally   │                         ▼
└──────────────┘               └───────────────────┘          ┌─────────────────────────────┐
                                                              │ 3. login → get MAGIC PROMPT │
                                                              │ (endpoint + key embedded)   │
                                                              └──────────────┬──────────────┘
                                                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 4. paste prompt into a new chat.z.ai AGENT-mode chat                                    │
│    → session auto-synced: vector memory, context enhancement, token saving, skills      │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                                                             │
                                     ┌───────────────────────────────────────┘
                                     ▼
              5. pair GitHub PAT → private repo auto-created
                 → ALL data auto-synced (repo = user's cloud DB)
```

## Features

- **Automated private tokens** — no signup: visit the app, get a `zm_…` token instantly, log in with it.
- **Magic prompt** — the dashboard generates a ready-to-paste activation prompt with your MCP endpoint and key embedded. Paste it into any chat.z.ai agent-mode chat and the session is wired to ZaiMem.
- **MCP server** (JSON-RPC 2.0, streamable HTTP) — 12 tools, 3 resources, prompt templates, batch calls, session ids, CORS.
- **Local vector memory** — 384-dim hashed word/bigram/char-4gram embeddings with cosine recall; auto-dedupe (0.94 duplicate / 0.80 merge thresholds), recency + keyword boosts, context-block assembly.
- **Token saver** — LLM-powered digests (with extractive fallback) compress long context; token accounting per action.
- **Smart skills** (zcode-smart-skill integration) — SKILL.md skill registry, auto trigger detection, difficulty budgets (E5: 2/6/12), ledger pages (`notes.md`, `tasks.json`) with size budgets, handoff brief with TRUST clause, reflection schema.
- **GitHub Cloud DB** — pair a GitHub PAT; a private repo is auto-created and every data change is auto-synced (sha-based idempotent pushes, 4s debounced, full audit trail). Your repo, your data.

## Quick start

### Clone & run locally

```bash
# 1. clone the repo
git clone https://github.com/romangalaxys10-spec/zaimem.git
cd zaimem

# 2. install dependencies (bun ≥ 1.2 recommended; npm/pnpm work too)
bun install

# 3. configure env
cp .env.example .env        # SQLite by default

# 4. create the database schema
bun run db:push

# 5. run
bun run dev                 # http://localhost:3000
```

Production build: `bun run build` → `bun run start` (standalone output on `localhost:3000`).

### First run

Then open the app → **Get my private token** → log in → copy the **Magic Prompt** → paste into a new chat.z.ai **agent-mode** chat.

## MCP endpoint

```
POST /api/mcp
Authorization: Bearer <api-key>        # or ?token=<api-key>
Content-Type: application/json
```

The endpoint implements the Model Context Protocol over streamable HTTP (`initialize`, `tools/list`, `tools/call`, `resources/*`, `prompts/*`, batch arrays, `MCP-Session-Id`).

### Tools

| Tool | Purpose |
|---|---|
| `zaimem_sync_session` | Register/sync the current chat.z.ai session |
| `zaimem_remember` | Store a memory (auto-dedupe + merge) |
| `zaimem_recall` | Vector + keyword recall with recency/importance boosts |
| `zaimem_enhance_context` | Build an injectable context block for the current message |
| `zaimem_save_tokens` | Digest/compress long content and bank the savings |
| `zaimem_detect_skill` | Detect a matching skill for the user's request |
| `zaimem_list_skills` | List registered skills (SKILL.md convention) |
| `zaimem_get_skill` | Fetch one skill's full SKILL.md protocol body |
| `zaimem_ledger_write` | Write a smart-skill ledger page (`notes.md`, `tasks.json`, …) |
| `zaimem_ledger_read` | Read a ledger page |
| `zaimem_session_summary` | Distill an end-of-session summary |
| `zaimem_handoff_brief` | Cross-session handoff brief (TRUST clause) |

### Resources & prompts

- `zaimem://protocol` — operating protocol (markdown)
- `zaimem://memory` — recent memories (json)
- `zaimem://skills` — skill registry (json)
- Prompt template `zaimem-boot` — boot a ZaiMem-synced session with memory recall

## Dashboard REST API

| Route | Description |
|---|---|
| `POST /api/auth/init` | Issue an automated private token |
| `POST /api/auth/login` | Log in with the token (cookie session) |
| `GET /api/auth/me` | Current user + stats + config |
| `GET/POST /api/sessions`, `GET/DELETE /api/sessions/[id]` | Session management |
| `GET /api/memories`, `POST /api/memories`, `DELETE /api/memories/[id]` | Memory browsing & vector search |
| `GET/PATCH /api/skills` | Skill registry + enable/disable |
| `GET /api/stats` | Usage statistics (tokens saved, actions) |
| `GET/POST /api/github` | Cloud DB status, pair / unpair / sync / toggle |

## GitHub Cloud DB

Pair your PAT (classic, `repo` scope) from the dashboard's **Cloud DB** tab:

1. PAT is validated against `GET /user` and stored **AES-256-GCM encrypted** (only last 4 chars are ever displayed).
2. A **private** repo (default `zaimem-cloud-db`) is auto-created in your account.
3. Every mutation (memories, sessions, ledger, skills, stats) triggers a debounced auto-sync.
4. Pushes are idempotent — unchanged files are skipped via git blob SHA comparison; your own files in the repo are never touched.

Repo layout:

```
index.json            # snapshot index + counts
README.md             # human-readable overview (regenerated)
memories.json         # all memories
vectors.jsonl         # 384-dim embeddings, one JSON per line
sessions/<slug>.json  # one file per session (turns, summary, metadata)
skills.json           # skill registry
stats.json            # usage statistics
sync/log.json         # sync audit trail
```

## Architecture

```
src/
├── app/api/…            # 12 route handlers (auth, sessions, memories, skills, stats, github, mcp)
├── components/zaimem/…  # landing, dashboard, cloud-db, panels, magic-prompt builder
└── lib/zaimem/
    ├── vector.ts        # hashed n-gram embeddings + cosine engine
    ├── memory.ts        # remember/recall/enhance with dedupe & boosts
    ├── compress.ts      # token saver (LLM digest + extractive fallback)
    ├── skills.ts        # smart-skill engine (triggers, budgets, ledger, handoff)
    ├── mcp.ts           # MCP tool/resource/prompt registry & dispatcher
    ├── github.ts        # PAT validation, repo provisioning, idempotent sync, debounce queue
    ├── crypto.ts        # AES-256-GCM at-rest encryption, blob sha
    ├── auth.ts          # token issuance & session auth
    └── seed.ts          # builtin skills bootstrap
```

Stack: **Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma + SQLite · z-ai-web-dev-sdk**.

## Testing

```bash
bun scripts/e2e-test.ts          # 46 HTTP checks — auth, MCP tools, dedupe, GitHub guards …
bun scripts/e2e-github-unit.ts   # 26 engine checks — full sync engine vs mock GitHub API
```

## Security notes

- Login tokens and API keys are high-entropy random strings; API keys authenticate every MCP call.
- GitHub PATs are encrypted at rest (AES-256-GCM, scrypt-derived key) and never returned by the API.
- The SQLite database and `.env` are local-only and excluded from version control.

## Community & links

| | |
|---|---|
| ⚡ **Built with** | [GLM 5.3 Flash — z.ai](https://z.ai/subscribe?ic=ROK78RJKNW) |
| 👑 **Lead by** | [Roman · Rommark.Dev](https://rommark.dev) |
| ✈️ **Telegram Blog** | [@VibeCodePrompterSystem](https://t.me/VibeCodePrompterSystem) |
| 🟢 **The Claw Blog** | [claw.rommark.dev](https://claw.rommark.dev) |
| 🛟 **Author of** | [Z-Assist Project](https://zhelp.space-z.ai/) |

## License

[MIT](./LICENSE) © RyzenCode
