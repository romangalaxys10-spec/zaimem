/**
 * Next.js instrumentation — runs once per server process startup.
 * Boots the ZaiMem scheduled cloud-DB backup loop (nodejs runtime only,
 * never in edge middleware or during `next build`).
 *
 * v1.8.3: the loop is a long-run-server feature. On Vercel (ephemeral
 * lambdas) it would fire per instance against a throwaway /tmp database,
 * so it stays off there.
 */

const onVercel = process.env.VERCEL === "1";

export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.ZAIMEM_SCHEDULER !== "off" &&
    !onVercel
  ) {
    const { startBackupScheduler } = await import("@/lib/zaimem/scheduler");
    startBackupScheduler();
  }
}
