import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { convertChatExport } from "@/lib/zaimem/transplant";
import { ingestDocument } from "@/lib/zaimem/ingest";
import { recordStat } from "@/lib/zaimem/memory";

export const dynamic = "force-dynamic";

/**
 * POST /api/import/chat-export { filename, text }
 * Memory transplant: accepts a ChatGPT (conversations.json) or Claude export
 * file, converts conversations to transcripts and ingests them as `document`
 * memories (chunked + embedded + deduped) — past chats become searchable.
 */
export async function POST(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({} as { filename?: string; text?: string }));
  const filename = String(body.filename ?? "chat-export.json").slice(0, 200);
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "bad_request", message: "text is required — the raw export file contents" }, { status: 400 });
  }
  if (text.length > 8_000_000) {
    return NextResponse.json({ error: "too_large", message: "Export file too large (max ~8MB of JSON text)" }, { status: 413 });
  }

  const converted = convertChatExport(text);
  if (!converted) {
    return NextResponse.json(
      { error: "unrecognized", message: "Not a recognizable ChatGPT/Claude export. Expected conversations.json (ChatGPT) or a chats array with chat_messages (Claude)." },
      { status: 422 },
    );
  }
  if (!converted.markdown.trim()) {
    return NextResponse.json({ error: "empty", message: "Export parsed but produced no messages." }, { status: 422 });
  }

  try {
    const r = await ingestDocument({
      userId: user.id,
      filename: `chat-export · ${filename}`,
      text: converted.markdown,
    });
    await recordStat({
      userId: user.id,
      action: "transplant",
      detail: { format: converted.format, conversations: converted.conversations, messages: converted.messages, chunks: r.chunks },
    });
    return NextResponse.json({
      ok: true,
      format: converted.format,
      conversations: converted.conversations,
      messages: converted.messages,
      chunks: r.chunks,
      status: r.status,
      tokensEst: r.tokensEst,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "ingest_failed", message: e instanceof Error ? e.message : "Could not ingest the converted transcript" },
      { status: 500 },
    );
  }
}
