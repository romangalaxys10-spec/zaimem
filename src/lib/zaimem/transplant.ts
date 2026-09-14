/**
 * Memory transplant — convert chat exports (ChatGPT, Claude) into an
 * ingest-ready markdown transcript so past conversations become searchable
 * vector memory via the standard document pipeline (chunk + embed + dedupe).
 */

export interface TransplantResult {
  markdown: string;
  conversations: number;
  messages: number;
  format: "chatgpt" | "claude" | "unknown";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chatgptToMarkdown(data: any): TransplantResult {
  const convos = Array.isArray(data) ? data : Array.isArray(data?.conversations) ? data.conversations : [];
  const parts: string[] = [];
  let messages = 0;
  for (const c of convos.slice(0, 100)) {
    const title = String(c?.title ?? "Untitled conversation").replace(/\s+/g, " ").slice(0, 120);
    parts.push(`# ${title}\n`);
    // ChatGPT exports store messages in a mapping tree with a current-node pointer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapping: Record<string, any> = c?.mapping ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodes: any[] = Object.values(mapping);
    const linear = nodes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((n: any) => n?.message)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((m: any) => m && m.author?.role && ["user", "assistant"].includes(m.author.role))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => {
        const partsArr: string[] = Array.isArray(m.content?.parts) ? m.content.parts : [];
        const text = partsArr.filter((p) => typeof p === "string").join("\n").trim();
        return { role: m.author.role as string, text, ts: m.create_time ?? 0 };
      })
      .filter((m) => m.text.length > 0)
      .sort((a, b) => a.ts - b.ts);
    for (const m of linear) {
      const who = m.role === "user" ? "User" : "Assistant";
      parts.push(`**${who}:** ${m.text.slice(0, 4000)}\n`);
      messages++;
    }
    parts.push("\n");
  }
  return { markdown: parts.join("\n").trim(), conversations: convos.length, messages, format: "chatgpt" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function claudeToMarkdown(data: any): TransplantResult {
  const convos = Array.isArray(data) ? data : Array.isArray(data?.chats) ? data.chats : [];
  const parts: string[] = [];
  let messages = 0;
  for (const c of convos.slice(0, 100)) {
    const title = String(c?.name ?? c?.title ?? "Untitled conversation").replace(/\s+/g, " ").slice(0, 120);
    parts.push(`# ${title}\n`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgs: any[] = Array.isArray(c?.chat_messages) ? c.chat_messages : Array.isArray(c?.messages) ? c.messages : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of msgs) {
      const role = String(m?.sender ?? m?.role ?? "user");
      const text = String(m?.text ?? m?.content ?? "").trim();
      if (!text) continue;
      const who = role === "assistant" ? "Assistant" : "User";
      parts.push(`**${who}:** ${text.slice(0, 4000)}\n`);
      messages++;
    }
    parts.push("\n");
  }
  return { markdown: parts.join("\n").trim(), conversations: convos.length, messages, format: "claude" };
}

/** Detect the export format and convert. Returns null when nothing usable was found. */
export function convertChatExport(jsonText: string): TransplantResult | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try { data = JSON.parse(jsonText); } catch { return null; }
  const looksChatGPT =
    (Array.isArray(data) && data.some((c) => c?.mapping)) ||
    (data && typeof data === "object" && Array.isArray(data.conversations) && data.conversations.some((c: { mapping?: unknown }) => c?.mapping));
  const looksClaude =
    (Array.isArray(data) && data.some((c) => c?.chat_messages)) ||
    (data && typeof data === "object" && Array.isArray(data.chats) && data.chats.some((c: { chat_messages?: unknown }) => c?.chat_messages));
  if (looksChatGPT) {
    const r = chatgptToMarkdown(data);
    return r.messages > 0 ? r : null;
  }
  if (looksClaude) {
    const r = claudeToMarkdown(data);
    return r.messages > 0 ? r : null;
  }
  return null;
}
