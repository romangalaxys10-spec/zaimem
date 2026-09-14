/**
 * ZaiMem MCP tool packs — dashboard-togglable capability groups
 * ─────────────────────────────────────────────────────────────────────────────
 * Every one of the 33 MCP tools belongs to exactly one pack. Users flip packs
 * on/off in the dashboard (Skills section); the MCP server then hides the
 * pack's tools from tools/list and refuses tools/call for them, so agents
 * only see the capabilities their human actually wants exposed.
 *
 * Disabled prefs are stored per-user in ToolPackPref; a missing row means
 * "enabled". The core-memory pack is locked — it IS the product.
 */

export interface ToolPack {
  id: string;
  name: string;
  description: string;
  tools: string[];
  /** locked packs cannot be disabled (core memory) */
  locked?: boolean;
}

export const TOOL_PACKS: ToolPack[] = [
  {
    id: "core-memory",
    name: "Core memory",
    description:
      "The heart of ZaiMem: session sync, remembering facts, vector recall, forgetting and the context enhancer. Always on.",
    tools: [
      "zaimem_sync_session",
      "zaimem_remember",
      "zaimem_remember_many",
      "zaimem_recall",
      "zaimem_forget",
      "zaimem_enhance_context",
    ],
    locked: true,
  },
  {
    id: "sessions",
    name: "Session continuity",
    description:
      "Session status & history pressure, catch-up briefs, resume, open-task picker, end-of-session summaries, handoff briefs, pre-created sessions and bootstrap/continue prompts for other IDEs.",
    tools: [
      "zaimem_session_status",
      "zaimem_brief_me",
      "zaimem_resume",
      "zaimem_task_next",
      "zaimem_session_summary",
      "zaimem_handoff_brief",
      "zaimem_session_create",
      "zaimem_session_prompt",
    ],
  },
  {
    id: "projects",
    name: "Project agent teams",
    description:
      "Multi-agent project collaboration: inject project instructions/files as a brief and generate handoff prompts so the next agent joins the same project with full context.",
    tools: ["zaimem_project_brief", "zaimem_project_handoff"],
  },
  {
    id: "meetings",
    name: "Meeting intelligence",
    description:
      "Tactiq-style meeting memory: ingest transcripts (auto summary + speakers + action items), list past meetings and ask questions across every saved meeting.",
    tools: ["zaimem_ingest_meeting", "zaimem_meetings_list", "zaimem_meeting_search"],
  },
  {
    id: "documents",
    name: "Document ingestion",
    description:
      "Drag-drop / MCP ingestion of PDF, DOCX, TXT and MD files with chunking, hash dedupe and source-cited lazy reading.",
    tools: ["zaimem_ingest_file", "zaimem_doc_read"],
  },
  {
    id: "web-tools",
    name: "Web & utilities",
    description:
      "Live web search, page fetching, exact arithmetic, timezone-aware time and a scratchpad step-by-step reasoner.",
    tools: ["zaimem_web_search", "zaimem_web_fetch", "zaimem_calc", "zaimem_time", "zaimem_think"],
  },
  {
    id: "smart-skills",
    name: "Smart skills & ledger",
    description:
      "The SKILL.md engine: auto-trigger detection, registry listing, full protocol fetch and the structured .smart/ ledger pages (notes.md, tasks.json…).",
    tools: ["zaimem_detect_skill", "zaimem_list_skills", "zaimem_get_skill", "zaimem_ledger_write", "zaimem_ledger_read"],
  },
  {
    id: "context-saver",
    name: "Token saver & headroom",
    description:
      "History compression that converts verbatim conversation into dense digests, plus the HEADROOM mode control for harder context compression.",
    tools: ["zaimem_save_tokens", "zaimem_headroom"],
  },
];

const TOOL_TO_PACK = new Map<string, ToolPack>();
for (const p of TOOL_PACKS) for (const t of p.tools) TOOL_TO_PACK.set(t, p);

/** Resolve which pack a tool belongs to. */
export function packForTool(toolName: string): ToolPack | undefined {
  return TOOL_TO_PACK.get(toolName);
}

/** All tool names across packs (used to validate coverage). */
export function allPackTools(): string[] {
  return [...TOOL_TO_PACK.keys()];
}
