import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { rememberMemory, isMemoryKind, recordStat } from "@/lib/zaimem/memory";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 1000;

interface ImportItem {
  content?: unknown;
  kind?: unknown;
  importance?: unknown;
  createdAt?: unknown;
}

/**
 * POST /api/memories/import
 * Bulk-import memories from a ZaiMem export file (or a bare JSON array).
 * Reuses rememberMemory so auto-dedupe / merge applies against existing data.
 */
export async function POST(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be JSON" },
      { status: 400 },
    );
  }

  const raw: unknown = Array.isArray(body) ? body : (body as { memories?: unknown })?.memories;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: "bad_format", message: "Expected { memories: [...] } or a JSON array" },
      { status: 400 },
    );
  }
  if (raw.length === 0) {
    return NextResponse.json({ error: "empty", message: "No memories to import" }, { status: 400 });
  }
  if (raw.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: "too_many", message: `Max ${MAX_ITEMS} memories per import (got ${raw.length})` },
      { status: 400 },
    );
  }

  let imported = 0;
  let merged = 0;
  let deduped = 0;
  let skipped = 0;

  for (const item of raw) {
    try {
      const it = (item ?? {}) as ImportItem;
      const content = typeof it.content === "string" ? it.content.trim() : "";
      if (!content) {
        skipped++;
        continue;
      }
      const kind = typeof it.kind === "string" && isMemoryKind(it.kind) ? it.kind : "fact";
      const importance =
        typeof it.importance === "number" && Number.isFinite(it.importance)
          ? Math.min(1, Math.max(0, it.importance))
          : 0.5;

      const res = await rememberMemory({ userId: user.id, content, kind, importance });
      if (res.created) {
        imported++;
        // preserve the original timeline when a valid createdAt was exported
        const created =
          typeof it.createdAt === "string" && !Number.isNaN(Date.parse(it.createdAt))
            ? new Date(it.createdAt)
            : null;
        if (created) {
          await db.memory
            .update({ where: { id: res.id }, data: { createdAt: created, updatedAt: created } })
            .catch(() => {});
        }
      } else if (res.deduped) {
        deduped++;
      } else if (res.merged) {
        merged++;
      }
    } catch {
      skipped++;
    }
  }

  await recordStat({
    userId: user.id,
    action: "import",
    detail: { imported, merged, deduped, skipped, total: raw.length },
  });

  return NextResponse.json({ total: raw.length, imported, merged, deduped, skipped });
}
