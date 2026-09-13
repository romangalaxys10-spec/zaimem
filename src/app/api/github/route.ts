import { NextRequest, NextResponse } from "next/server";
import { authenticate, extractToken, unauthorized } from "@/lib/zaimem/auth";
import { db } from "@/lib/db";
import { pairUser, unpairUser, syncUser, GhError } from "@/lib/zaimem/github";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof GhError) {
    return NextResponse.json({ error: "github", message: e.message }, { status: e.status >= 400 && e.status < 600 ? e.status : 502 });
  }
  return NextResponse.json({ error: "github", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
}

/** GET /api/github — pairing status + recent sync log */
export async function GET(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

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
 */
export async function POST(req: NextRequest) {
  const user = await authenticate(extractToken(req));
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({} as { action?: string; pat?: string; repoName?: string; autoSync?: boolean }));

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
      default:
        return NextResponse.json({ error: "bad_request", message: "Unknown action. Use pair | unpair | sync | toggle." }, { status: 400 });
    }
  } catch (e) {
    return fail(e);
  }
}
