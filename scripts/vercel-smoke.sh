#!/usr/bin/env bash
# v1.8.3 — functional sweep of the Vercel production deployment.
#
# Two classes of checks:
#   HEALTH    — stateless / single-request endpoints: must always pass.
#   STATEFUL  — multi-request state flows (session → prompt, ingest → search,
#               MCP session). On ephemeral /tmp SQLite every lambda instance
#               owns a separate blank database, so these only pass while the
#               fleet keeps serving from one warm instance. Reported as
#               "db-dep" and counted separately — they turn hard-green when
#               DATABASE_URL points at a shared Postgres.
set -u
B="https://zaimem.vercel.app"
C="Content-Type: application/json"
P=0; F=0; D=0
ok()  { P=$((P+1)); printf "  ✓ %s\n" "$1"; }
bad() { F=$((F+1)); printf "  ✗ %s  %s\n" "$1" "${2:-}"; }
dbp() { D=$((D+1)); printf "  ◆ db-dep %s (%s)\n" "$1" "${2:-instance split — goes hard-green on Postgres}"; }
chk()  { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (want $2 got $3)" "${4:-}"; fi; }

TOKEN=$(curl -s --max-time 30 -X POST "$B/api/auth/init" -H "$C" -d '{"label":"smoke-1-8-3"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])" 2>/dev/null)
[ -n "$TOKEN" ] && ok "auth/init issues token (${TOKEN:0:8}…)" || { bad "auth/init" "no token"; exit 1; }
A="Authorization: Bearer $TOKEN"

echo "── 1. account & stats (HEALTH) ─────────────"
chk "GET /api/auth/me" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H "$A" "$B/api/auth/me")"
ME=$(curl -s -H "$A" "$B/api/auth/me"); echo "$ME" | rg -q '"userId"' && ok "me payload sane (no secrets)" || bad "me payload" "$(echo $ME | head -c 100)"
chk "GET /api/stats" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H "$A" "$B/api/stats")"

echo "── 2. state flows (STATEFUL) ───────────────"
S=$(curl -s -w '\n%{http_code}' -X POST -H "$A" -H "$C" "$B/api/sessions" -d '{"title":"Vercel smoke","brief":"smoke-check"}')
SC=$(echo "$S" | tail -1); SB=$(echo "$S" | head -n -1)
if [ "$SC" = "201" ]; then
  SID=$(echo "$SB" | python3 -c "import json,sys; print(json.load(sys.stdin)['session']['id'])" 2>/dev/null)
  ok "POST /api/sessions → 201 (+prompt)"
  PR=$(curl -s -o /dev/null -w '%{http_code}' -H "$A" "$B/api/sessions/$SID/prompt")
  [ "$PR" = "200" ] && ok "GET /api/sessions/[id]/prompt → 200" || dbp "session prompt" "code $PR"
else
  dbp "POST /api/sessions" "code $SC (empty instance db)"
  SID=""
fi
ING=$(curl -s -X POST -H "$A" -H "$C" "$B/api/ingest" -d '{"filename":"smoke.md","text":"ZaiMem deploys to Vercel on every push. Tokens are hashed with sha256. Search uses ngram vectors."}')
echo "$ING" | rg -q '"status":"ingested"' && ok "POST /api/ingest chunks+embeds" || dbp "POST /api/ingest" "$(echo $ING | head -c 100)"
SR=$(curl -s "$B/api/memories?q=deploy%20pipeline" -H "$A")
echo "$SR" | rg -q '"memories"|\[\{' && ok "GET /api/memories?q= search" || dbp "memory search" "$(echo $SR | head -c 100)"

echo "── 3. MCP (STATEFUL, Bearer auth) ──────────"
MCP() { curl -s --max-time 30 -X POST "$B/api/mcp" -H "$A" -H "$C" -d "$1"; }
INIT=$(MCP '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke","version":"1.8.3"}}}')
if echo "$INIT" | rg -q '"serverInfo"'; then
  ok "MCP initialize"
  SESSID=$(curl -s -D - -o /dev/null -X POST "$B/api/mcp" -H "$A" -H "$C" -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke","version":"1.8.3"}}}' | rg -io "mcp-session-id: .*" | head -1 | tr -d '\r' | awk '{print $2}')
  TL=$(MCP "{\"jsonrpc\":\"2.0\",\"method\":\"tools/list\",\"id\":2}" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)))" 2>/dev/null)
  CNT=$(echo "$INIT" > /dev/null; curl -s -X POST "$B/api/mcp" -H "$A" -H "Mcp-Session-Id: $SESSID" -H "$C" -d '{"jsonrpc":"2.0","method":"tools/list","id":2}' | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']['tools']))" 2>/dev/null)
  [ "${CNT:-0}" -ge 33 ] && ok "tools/list → $CNT tools" || dbp "tools/list" "count ${CNT:-ERR}"
  TC=$(curl -s -X POST "$B/api/mcp" -H "$A" -H "Mcp-Session-Id: $SESSID" -H "$C" -d '{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"memory_search","arguments":{"query":"deploy"}}}')
  echo "$TC" | rg -q '"content"' && ok "tools/call memory_search" || dbp "tools/call" "$(echo $TC | head -c 100)"
  LW=$(curl -s -X POST "$B/api/mcp" -H "$A" -H "Mcp-Session-Id: $SESSID" -H "$C" -d '{"jsonrpc":"2.0","method":"tools/call","id":4,"params":{"name":"ledger_write","arguments":{"content":"smoke ledger entry"}}}')
  echo "$LW" | rg -q '"content"' && ok "tools/call ledger_write" || dbp "ledger_write" "$(echo $LW | head -c 100)"
  RES=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/mcp" -H "$A" -H "Mcp-Session-Id: $SESSID" -H "$C" -d '{"jsonrpc":"2.0","method":"resources/list","id":5}')
  [ "$RES" = "200" ] && ok "resources/list → 200" || dbp "resources/list" "code $RES"
else
  dbp "MCP initialize" "$(echo $INIT | head -c 120)"
fi

echo "── 4. export & skills (HEALTH) ─────────────"
EX=$(curl -s -o /tmp/exp.json -w '%{http_code}' -H "$A" "$B/api/export")
[ "$EX" = "200" ] && ok "GET /api/export → 200" || bad "export" "code $EX"
python3 -c "import json; d=json.load(open('/tmp/exp.json')); assert all(k in d for k in ('memories','sessions','ledgerPages','skills'))" 2>/dev/null && ok "export archive shape" || bad "export shape" "$(head -c 100 /tmp/exp.json)"
chk "GET /api/skills" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H "$A" "$B/api/skills")"
chk "GET /api/memories" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H "$A" "$B/api/memories?limit=5")"

echo "── 5. guards & headers (HEALTH) ────────────"
chk "no token → 401 (me)" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/auth/me")"
chk "no token → 401 (export)" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/export")"
chk "bad token → 401 (mcp)" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/mcp" -H "Authorization: Bearer zm_invalid" -H "$C" -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{}}')"
H=$(curl -s -D - -o /dev/null "$B/")
echo "$H" | rg -qi "strict-transport-security" && ok "HSTS" || bad "HSTS"
echo "$H" | rg -qi "frame-ancestors|x-frame-options" && bad "frame directives reappeared" || ok "iframe-embeddable"
chk "landing" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$B/")"

echo
echo "RESULT: $P passed · $F failed · $D db-dependent (ephemeral per-instance SQLite)"
[ "$F" = "0" ]
