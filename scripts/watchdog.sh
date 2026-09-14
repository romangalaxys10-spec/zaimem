#!/usr/bin/env bash
# ZaiMem surface watchdog — keeps the production server on :3000 alive.
#
# Why: this sandbox's long-running surface died repeatedly (dev-mode memory
# bloat ~1.2GB/4GB, stdin-EOF process reaping, manual pkill during maintenance).
# Each death let the platform gateway mark the space-z.ai deployment "Failed".
# The production server + this watchdog remove that failure mode: every 30s the
# port is health-checked, and a dead/stale server is restarted with the proven
# stdin-keeper pattern that survives the sandbox's process reaping.
#
# Run: (sleep infinity | bash scripts/watchdog.sh > /dev/null 2>&1 &)

cd /home/z/my-project || exit 1

PORT=3000
LOG=watchdog.log
PIDFILE=/tmp/zaimem-watchdog.pid
LAST_RESTART=0

# single-instance guard
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "[$(date '+%F %T')] watchdog already running (pid $(cat "$PIDFILE"))" >> "$LOG"
  exit 0
fi
echo $$ > "$PIDFILE"

port_pids() {
  ss -tlnp 2>/dev/null | awk -v p=":${PORT}\$" '$4 ~ p' \
    | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
}

while true; do
  if ! curl -fsS -o /dev/null --max-time 8 "http://127.0.0.1:${PORT}/" 2>/dev/null; then
    NOW=$(date +%s)
    # flap protection: at most one restart per 60s
    if [ $((NOW - LAST_RESTART)) -gt 60 ]; then
      LAST_RESTART=$NOW
      echo "[$(date '+%F %T')] health check failed on :${PORT} — restarting" >> "$LOG"
      if [ ! -f .next/BUILD_ID ]; then
        echo "[$(date '+%F %T')] ERROR: .next/BUILD_ID missing — run 'bun run build' first; not starting" >> "$LOG"
      else
        PIDS=$(port_pids)
        if [ -n "$PIDS" ]; then
          echo "[$(date '+%F %T')] killing stale server pid(s): $PIDS" >> "$LOG"
          kill $PIDS 2>/dev/null
          sleep 3
          kill -9 $PIDS 2>/dev/null
        fi
        (sleep infinity | node_modules/.bin/next start -p "$PORT" >> prod-server.log 2>&1 &)
        echo "[$(date '+%F %T')] restarted production server on :${PORT}" >> "$LOG"
        sleep 10
      fi
    fi
  fi
  sleep 30
done
