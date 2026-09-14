import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { pairUser, unpairUser, syncUser, GhError, listSnapshotHistory, restoreFromSnapshot } from "@/lib/zaimem/github";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof GhError) {
    return NextResponse.json({ error: "github", message: e.message }, { status: e.status >= 400 && e.status < 600 ? e.status : 502 });
  }
  return NextResponse.json({ error: "github", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
}

/** GET /api/github — pairing status + recent sync log (+ schedule fields).
 *  GET /api/github?history=1 — snapshot commit history for point-in-time restore. */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  if (req.nextUrl.searchParams.get("history")) {
    try {
      const history = await listSnapshotHistory(user.id);
      return NextResponse.json({ ok: true, history });
    } catch (e) {
      return fail(e);
    }
  }

  const link = await db.githubLink.findUnique({ where: { userId: user.id } });
  const logs = await db.syncLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  const counts = {
    sessions: await db.session.count({ where: { userId: user.id } }),
    memories: await db.memory.count({ where: { userId: user.id } }),
    skills: await db.skill.count({ where: { userId: user.id } }),
    ledgerPages: await db.ledgerPage.count({ where: { userId: user.id } }),
  };

  return NextResponse.json({
    linked: !!link,
    link: link ? {
      login: link.login,
      patHint: link.patHint,
      repoName: link.repoName,
      repoFull: link.repoFull,
      repoUrl: link.repoUrl,
      branch: link.branch,
      autoSync: link.autoSync,
      scheduleEnabled: link.scheduleEnabled,
      lastScheduledAt: link.lastScheduledAt,
      status: link.status,
      lastError: link.lastError,
      lastSyncAt: link.lastSyncAt,
      syncCount: link.syncCount,
    } : null,
    counts,
    logs,
  });
}

/**
 * POST /api/github  { action: "pair", pat, repoName? }
 *                or { action: "unpair" }
 *                or { action: "sync" }
 *                or { action: "toggle", autoSync }
 *                or { action: "toggle_schedule", scheduleEnabled }
 *                or { action: "restore", sha }
 */
export async function POST(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({} as { action?: string; pat?: string; repoName?: string; autoSync?: boolean; scheduleEnabled?: boolean }));

  try {
    switch (body.action) {
      case "pair": {
        const pat = String(body.pat ?? "").trim();
        const { link, repo, result } = await pairUser(user.id, pat, body.repoName);
        return NextResponse.json({
          ok: true,
          created: repo.created,
          link: {
            login: link.login, repoName: link.repoName, repoFull: link.repoFull,
            repoUrl: link.repoUrl, branch: link.branch, status: link.status, syncCount: link.syncCount,
          },
          sync: result,
        });
      }
      case "unpair": {
        const ok = await unpairUser(user.id);
        return NextResponse.json({ ok, message: ok ? "GitHub detached. The repo and its history stay in your GitHub account." : "GitHub was not paired." });
      }
      case "sync": {
        const result = await syncUser(user.id, "force");
        return NextResponse.json({ ok: true, sync: result });
      }
      case "toggle": {
        const link = await db.githubLink.update({
          where: { userId: user.id },
          data: { autoSync: !!body.autoSync },
        });
        return NextResponse.json({ ok: true, autoSync: link.autoSync });
      }
      case "toggle_schedule": {
        const existing = await db.githubLink.findUnique({ where: { userId: user.id }, select: { id: true } });
        if (!existing) {
          return NextResponse.json({ error: "github", message: "GitHub is not paired for this account." }, { status: 400 });
        }
        const link = await db.githubLink.update({
          where: { userId: user.id },
          data: { scheduleEnabled: !!body.scheduleEnabled },
        });
        return NextResponse.json({ ok: true, scheduleEnabled: link.scheduleEnabled });
      }
      case "restore": {
        const sha = String(body.sha ?? "").trim();
        if (!/^[a-f0-9]{7,40}$/i.test(sha)) {
          return NextResponse.json({ error: "bad_request", message: "Provide a snapshot commit sha." }, { status: 400 });
        }
        const result = await restoreFromSnapshot(user.id, sha);
        return NextResponse.json({ ok: true, restore: result });
      }
      default:
        return NextResponse.json({ error: "bad_request", message: "Unknown action. Use pair | unpair | sync | toggle | toggle_schedule | restore." }, { status: 400 });
    }
  } catch (e) {
    return fail(e);
  }
}
