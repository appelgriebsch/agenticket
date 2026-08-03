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

- [ ] `src/config.ts` — load/merge/save config; data-dir resolution
- [ ] `src/cli/daemon.ts` — spawn/pidfile/health-wait/stop/status
- [ ] Wire commands in `src/cli/index.ts`; graceful SIGTERM handler in server
      (close HTTP → `PRAGMA wal_checkpoint(TRUNCATE)` → close db)
- [ ] First-boot bootstrap: create data dir, migrate, seed statuses, set admin
      password from env if present (else warn UI login disabled until set)
- [ ] `scripts/smoke-pack.sh`: `npm pack` → install tarball into temp dir →
      `npx agenticket start` (Node) → curl /healthz → MCP ping with token →
      `agenticket stop`; repeat with `bunx` under Bun. **This test catches the two
      packaging landmines: migrations path resolution and bunx/better-sqlite3.**
- [ ] GitHub Actions: Node 20 + 24 full suite; Bun job = build + smoke-pack

## Out of scope

Docker (phase 5), publishing to npm (manual, later).

## Verification checklist

```sh
npm test && npm run typecheck && npm run lint && npm run build
bash scripts/smoke-pack.sh      # both runtimes pass
agenticket start && agenticket status && agenticket stop   # via node bin/... locally
```

## Handoff notes

_(fill in when phase completes)_
