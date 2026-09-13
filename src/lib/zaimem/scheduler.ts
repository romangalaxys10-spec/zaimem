/**
 * ZaiMem Scheduled Backup
 * ─────────────────────────────────────────────────────────────────────────────
 * Periodic full-snapshot backup of every linked user's cloud DB, independent
 * of the debounced auto-sync (which only fires on data changes).
 *
 *   • started once per server process via src/instrumentation.ts register()
 *   • interval: ZAIMEM_BACKUP_HOURS env (default 24h, clamped 0.02–168h)
 *   • first pass: 90s after boot (lets the server settle)
 *   • users opt in/out per-link via scheduleEnabled (Cloud DB panel)
 *   • each run: per-user mutex → syncUser(trigger "scheduled") → logs a
 *     "backup" SyncLog entry + stamps lastScheduledAt
 *   • resilient: one failing user never blocks the others
 *
 * Disable entirely with ZAIMEM_SCHEDULER=off (used in Docker build stage).
 */

import { db } from "@/lib/db";
import { syncUser, GhError } from "./github";

const DEFAULT_HOURS = 24;
const FIRST_RUN_DELAY_MS = 90_000;

let started = false;
let running = false;

function intervalHours(): number {
  const raw = Number(process.env.ZAIMEM_BACKUP_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_HOURS;
  return Math.min(168, Math.max(0.02, raw));
}

export function nextRunAt(from = new Date()): Date {
  return new Date(from.getTime() + intervalHours() * 3600_000);
}

/** Best-effort "users due for a scheduled backup" selector. */
async function dueUsers(): Promise<{ userId: string; repoFull: string }[]> {
  const links = await db.githubLink.findMany({
    where: { scheduleEnabled: true },
    select: { userId: true, repoFull: true, lastScheduledAt: true },
  });
  const dueAt = Date.now() - intervalHours() * 3600_000;
  return links
    .filter((l) => !l.lastScheduledAt || new Date(l.lastScheduledAt).getTime() <= dueAt)
    .map((l) => ({ userId: l.userId, repoFull: l.repoFull }));
}

/**
 * Run one backup pass over every due user. Sequential (gentle on the API);
 * per-user failures are recorded inside syncUser (status=error + SyncLog).
 * Pass explicit userIds for tests / manual invocation.
 */
export async function runScheduledBackups(userIds?: string[]): Promise<{
  attempted: number; ok: number; failed: number; skipped: number;
}> {
  if (running) return { attempted: 0, ok: 0, failed: 0, skipped: 0 };
  running = true;
  let ok = 0, failed = 0, skipped = 0;
  try {
    let targets: { userId: string; repoFull: string }[];
    if (userIds) {
      const links = await db.githubLink.findMany({
        where: { userId: { in: userIds }, scheduleEnabled: true },
        select: { userId: true, repoFull: true },
      });
      targets = links;
    } else {
      targets = await dueUsers();
    }

    for (const t of targets) {
      try {
        const link = await db.githubLink.findUnique({
          where: { userId: t.userId },
          select: { id: true },
        });
        if (!link) { skipped++; continue; }
        await syncUser(t.userId, "scheduled");
        await db.githubLink.update({
          where: { userId: t.userId },
          data: { lastScheduledAt: new Date() },
        });
        ok++;
      } catch (e) {
        failed++;
        // GhError("not paired") → link vanished mid-run; syncUser already logged
        if (!(e instanceof GhError && e.status === 400)) {
          console.error(`[zaimem:scheduler] backup failed for ${t.userId}:`, e instanceof Error ? e.message : e);
        }
      }
    }
    if (targets.length) {
      console.log(`[zaimem:scheduler] pass done — ${ok} ok · ${failed} failed · ${skipped} skipped (of ${targets.length})`);
    }
    return { attempted: targets.length, ok, failed, skipped };
  } finally {
    running = false;
  }
}

/** Idempotently start the background scheduler (server processes only). */
export function startBackupScheduler(): void {
  if (started) return;
  started = true;
  const h = intervalHours();
  console.log(`[zaimem:scheduler] started — scheduled cloud-DB backup every ${h}h`);
  setTimeout(() => {
    runScheduledBackups().catch((e) =>
      console.error("[zaimem:scheduler] initial pass failed:", e instanceof Error ? e.message : e),
    );
    setInterval(() => {
      runScheduledBackups().catch((e) =>
        console.error("[zaimem:scheduler] pass failed:", e instanceof Error ? e.message : e),
      );
    }, h * 3600_000);
  }, FIRST_RUN_DELAY_MS).unref?.();
}
