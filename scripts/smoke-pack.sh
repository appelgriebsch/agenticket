#!/usr/bin/env bash
# Pack-install smoke test: proves the published tarball works via `npx` under Node
# AND `bunx` under Bun. Catches the two packaging landmines: migrations path
# resolution (must be embedded, no folder lookup) and bunx/better-sqlite3 (Bun
# skips its postinstall, so the native addon must never load there).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
NODE_PORT="${SMOKE_NODE_PORT:-3591}"
BUN_PORT="${SMOKE_BUN_PORT:-3592}"

cleanup() {
  (cd "$WORK/node-env" 2>/dev/null && npx --no-install agenticket --data-dir "$WORK/node-data" stop >/dev/null 2>&1) || true
  (cd "$WORK/bun-env" 2>/dev/null && bunx --bun agenticket --data-dir "$WORK/bun-data" stop >/dev/null 2>&1) || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "==> build + npm pack"
cd "$ROOT"
npm run build >/dev/null
npm pack --pack-destination "$WORK" >/dev/null
TARBALL="$(ls "$WORK"/agenticket-*.tgz)"

# $1 label, $2 port, rest: command that runs the agenticket CLI (from inside $WORK/$1-env)
smoke() {
  local label="$1" port="$2"
  shift 2
  local env_dir="$WORK/$label-env" data_dir="$WORK/$label-data"
  local run=("$@")

  cli() { (cd "$env_dir" && "${run[@]}" --data-dir "$data_dir" "$@"); }

  echo "==> [$label] start (daemon)"
  cli start --port "$port"

  echo "==> [$label] healthz"
  curl -fsS "http://127.0.0.1:$port/healthz" | grep -q '"ok":true'

  echo "==> [$label] token create + MCP initialize"
  local token
  token="$(cli token create smoke-agent 2>/dev/null)"
  curl -fsS -X POST "http://127.0.0.1:$port/mcp" \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
    | grep -q serverInfo

  echo "==> [$label] status + stop"
  cli status
  cli stop
  if curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null 2>&1; then
    echo "server still responding after stop" >&2
    exit 1
  fi
}

echo "==> install tarball with npm (Node)"
mkdir -p "$WORK/node-env"
(cd "$WORK/node-env" && npm init -y >/dev/null && npm install "$TARBALL" >/dev/null)
smoke node "$NODE_PORT" npx --no-install agenticket

if command -v bun >/dev/null 2>&1; then
  echo "==> install tarball with bun (Bun)"
  mkdir -p "$WORK/bun-env"
  # --ignore-scripts mirrors real bunx behavior: better-sqlite3's postinstall never
  # runs under Bun, so its native addon must never be loaded there (bun:sqlite is).
  (cd "$WORK/bun-env" && bun init -y >/dev/null 2>&1 && bun add --ignore-scripts "$TARBALL" >/dev/null 2>&1)
  smoke bun "$BUN_PORT" bunx --bun agenticket
else
  echo "==> bun not found — skipping Bun leg" >&2
  exit 1
fi

echo "smoke-pack: OK (node + bun)"
