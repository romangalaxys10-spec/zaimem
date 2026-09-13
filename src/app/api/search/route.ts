import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { globalSearch } from "@/lib/zaimem/search";

export const dynamic = "force-dynamic";

/** GET /api/search?q=… — global search across sessions, memories, ledger & skills */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ error: "bad_request", message: "Query parameter 'q' is required." }, { status: 400 });
  }

  try {
    const results = await globalSearch(user.id, q);
    return NextResponse.json(results);
  } catch (e) {
    return NextResponse.json(
      { error: "search_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
