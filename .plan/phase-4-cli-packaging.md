# Phase 4 — CLI + Packaging

## Goal

Full CLI (`npx`/`bunx agenticket ...`) with daemon start/stop, config, and token
management, plus a pack-install smoke test proving the published tarball works under
both npm and Bun.

## CLI surface

```
agenticket start [--port 3547] [--host 127.0.0.1] [--data-dir PATH] [--foreground]
agenticket stop
agenticket restart
agenticket status
agenticket config [list | get <key> | set <key> <value>]
agenticket token create <name> | token list | token revoke <name>
agenticket admin set-password        # prompts; AGENTICKET_ADMIN_PASSWORD honored at first boot
```

## Design

- **Data dir**: `$AGENTICKET_DATA_DIR` → else `env-paths('agenticket').data`
  (`~/.local/share/agenticket` on Linux). Contains `agenticket.db` (+wal/shm),
  `config.json`, `agenticket.pid`, `agenticket.log`. One dir = trivial Docker volume.
- **Config precedence**: CLI flags > env vars (`AGENTICKET_PORT`, `AGENTICKET_HOST`,
  `AGENTICKET_DATA_DIR`, `AGENTICKET_ADMIN_PASSWORD`) > config.json > defaults.
- **Daemon**: `start` spawns its own runtime binary (`process.execPath`) with
  `--foreground`, `detached: true`, stdout/stderr → `agenticket.log`, `unref()`;
  writes pid file; polls `/healthz` until up (10s timeout); prints URL; exits.
  `stop`: read pidfile → `process.kill(pid, 'SIGTERM')`; server handler closes HTTP,
  checkpoints WAL, deletes pidfile. Stale pid detected via `kill(pid, 0)`.
  Windows: SIGTERM degrades to hard kill — documented, WAL recovers.
- Docker runs `start --foreground` as PID 1 (phase 5).
- `token create`/`config` operate directly on db/config file — no running server
  needed (WAL makes concurrent CLI+server access safe).

## Tasks

- [x] `src/config.ts` — load/merge/save config; data-dir resolution
- [x] `src/cli/daemon.ts` — spawn/pidfile/health-wait/stop/status
- [x] Wire commands in `src/cli/index.ts`; graceful SIGTERM handler in server
      (close HTTP → `PRAGMA wal_checkpoint(TRUNCATE)` → close db)
- [x] First-boot bootstrap: create data dir, migrate, seed statuses, set admin
      password from env if present (else warn UI login disabled until set)
- [x] `scripts/smoke-pack.sh`: `npm pack` → install tarball into temp dir →
      `npx agenticket start` (Node) → curl /healthz → MCP ping with token →
      `agenticket stop`; repeat with `bunx` under Bun. **This test catches the two
      packaging landmines: migrations path resolution and bunx/better-sqlite3.**
- [x] GitHub Actions: Node 20 + 24 full suite; Bun job = build + smoke-pack

## Out of scope

Docker (phase 5), publishing to npm (manual, later).

## Verification checklist

```sh
npm test && npm run typecheck && npm run lint && npm run build
bash scripts/smoke-pack.sh      # both runtimes pass
agenticket start && agenticket status && agenticket stop   # via node bin/... locally
```

## Handoff notes

Completed 2026-08-03. All verification items pass: 48 tests, typecheck, lint, build,
`scripts/smoke-pack.sh` green on Node (npx) AND Bun (bunx), local
start/status/restart/stop/config/token/admin exercised via `node bin/agenticket.js`.

Layout & conventions:

- `src/config.ts` — `resolveDataDir(override?)` (flag > `AGENTICKET_DATA_DIR` > env-paths),
  `dataPaths(dir)` → `{db, config, pid, log}`, `resolveConfig(dir, flags)` implements
  flags > env (`AGENTICKET_PORT`/`AGENTICKET_HOST`) > config.json > defaults
  (3547 / 127.0.0.1). Config keys are just `port` + `host` for now (`CONFIG_KEYS`).
- `src/cli/daemon.ts` — daemon spawns `process.execPath process.argv[1] start
  --foreground ...`, detached, output → `agenticket.log`, polls `/healthz` (10s) and
  aborts early if the child dies. **Pidfile is owned by the foreground server process**
  (written on boot, removed on graceful shutdown), so Docker `start --foreground` gets
  status/stop for free. Pidfile line 1 = pid, line 2 = actually-bound `host:port`
  (so `status` reports the truth even when flags overrode config). Stale pids detected
  via `kill(pid, 0)` and cleaned up.
- `src/cli/index.ts` — global `--data-dir`; commands: start/stop/restart/status,
  `config list|get|set`, `token create|list|revoke <name>` (revoke is by NAME, looked
  up then revoked by id), `admin set-password` (hidden tty prompt; piped stdin works —
  two lines = password + confirm — used by tests/scripts). Token/config commands open
  the db directly (WAL) — no running server needed.
- `scripts/smoke-pack.sh` — npm pack → temp installs; Bun leg uses
  `bun add --ignore-scripts` to mirror real bunx behavior (better-sqlite3 postinstall
  never runs under Bun; plain `bun add` would actually FAIL trying node-gyp). Ports
  3591/3592 (override `SMOKE_NODE_PORT`/`SMOKE_BUN_PORT`).
- `.github/workflows/ci.yml` — node job (20, 24): lint/typecheck/test/build + both
  smoke scripts; bun job: smoke-db, smoke-mcp, smoke-pack.

For phase 5 (Docker): run `agenticket start --foreground --host 0.0.0.0` as PID 1;
mount the data dir as the volume (`AGENTICKET_DATA_DIR=/data`); SIGTERM already
checkpoints WAL and removes the pidfile. `AGENTICKET_ADMIN_PASSWORD` bootstraps the
admin password on first boot.
