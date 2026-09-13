/**
 * Next.js instrumentation — runs once per server process startup.
 * Boots the ZaiMem scheduled cloud-DB backup loop (nodejs runtime only,
 * never in edge middleware or during `next build`).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ZAIMEM_SCHEDULER !== "off") {
    const { startBackupScheduler } = await import("@/lib/zaimem/scheduler");
    startBackupScheduler();
  }
}
