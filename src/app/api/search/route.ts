import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { globalSearch, SEARCH_KINDS, SEARCH_RANGES, type SearchFilters } from "@/lib/zaimem/search";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=…&kind=…&range=…
 * Global search across sessions, memories, ledger & skills with optional
 * result filters:
 *   kind  — all | sessions | memories | ledger | skills   (default all)
 *   range — all | 24h | 7d | 30d | 90d | 365d             (default all)
 */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ error: "bad_request", message: "Query parameter 'q' is required." }, { status: 400 });
  }

  const kind = (req.nextUrl.searchParams.get("kind") ?? "all").trim();
  const range = (req.nextUrl.searchParams.get("range") ?? "all").trim();
  if (!(SEARCH_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json(
      { error: "bad_request", message: `Invalid kind '${kind}'. Allowed: ${SEARCH_KINDS.join(", ")}.` },
      { status: 400 },
    );
  }
  if (!(SEARCH_RANGES as readonly string[]).includes(range)) {
    return NextResponse.json(
      { error: "bad_request", message: `Invalid range '${range}'. Allowed: ${SEARCH_RANGES.join(", ")}.` },
      { status: 400 },
    );
  }

  try {
    const filters: SearchFilters = { kind: kind as SearchFilters["kind"], range: range as SearchFilters["range"] };
    const results = await globalSearch(user.id, q, filters);
    return NextResponse.json(results);
  } catch (e) {
    return NextResponse.json(
      { error: "search_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
