import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { ingestMeeting, listMeetings } from "@/lib/zaimem/meetings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/meetings — list ingested meetings with summaries + action items. */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const meetings = await listMeetings(user.id, 40);
  return NextResponse.json({ meetings });
}

/** POST /api/meetings — ingest a transcript: {title, transcript, platform?, participants?, date?, session_id?}. */
export async function POST(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const title = String(body.title ?? "").trim();
  const transcript = String(body.transcript ?? "");
  if (!title) return NextResponse.json({ error: "bad_request", message: "title is required" }, { status: 400 });
  if (transcript.trim().length < 40) return NextResponse.json({ error: "bad_request", message: "transcript is required (min 40 chars)" }, { status: 400 });
  try {
    const result = await ingestMeeting({
      userId: user.id,
      title,
      transcript,
      platform: typeof body.platform === "string" ? body.platform : undefined,
      participants: typeof body.participants === "string" ? body.participants : undefined,
      date: typeof body.date === "string" ? body.date : undefined,
      sessionId: typeof body.session_id === "string" ? body.session_id : null,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "bad_request", message: e instanceof Error ? e.message : "meeting ingest failed" }, { status: 400 });
  }
}
