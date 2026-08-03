# Phase 5 — Docker

## Goal

Single-container self-host image a user can boot with one command.

## Design

- Base: `oven/bun:1-slim` — Bun runtime means `bun:sqlite` (no native build stage,
  no better-sqlite3 compile). Multi-stage: build with dev deps → copy `dist/`, `bin/`,
  prod `node_modules` (pruned) into slim runtime layer.
- Data at `/data` (`AGENTICKET_DATA_DIR=/data`), declared VOLUME.
- `ENV AGENTICKET_HOST=0.0.0.0` (container must bind all interfaces), port 3547 EXPOSEd.
- CMD: `bun bin/agenticket.js start --foreground` (PID 1; SIGTERM → graceful shutdown
  from phase 4). HEALTHCHECK curl/fetch `/healthz`.
- Admin password via `AGENTICKET_ADMIN_PASSWORD` env at first boot.

Target UX:

```sh
docker run -d -p 3547:3547 -v agenticket-data:/data \
  -e AGENTICKET_ADMIN_PASSWORD=change-me agenticket:latest
docker exec <ctr> bun bin/agenticket.js token create my-agent
```

## Tasks

- [x] `Dockerfile` (multi-stage, bun base)
- [x] `.dockerignore`
- [x] `docker-compose.yml` example in repo root (volume + env, for docs)
- [x] README section: docker quickstart (full docs phase 7)

## Verification checklist

```sh
docker build -t agenticket:dev .
docker run -d --name agt-test -p 3547:3547 -v agt-test:/data -e AGENTICKET_ADMIN_PASSWORD=test agenticket:dev
curl -s localhost:3547/healthz                      # ok
docker exec agt-test bun bin/agenticket.js token create smoke   # prints agt_ token
# MCP tool call with that token from host succeeds
docker restart agt-test && curl -s localhost:3547/healthz       # data survived
```

## Handoff notes

_Completed 2026-08-03._ Full verification checklist ran locally (Docker 29):
build → run → healthz → `token create` via `docker exec` → MCP `create_project`
from host → `docker restart` → project still listed → HEALTHCHECK reports
`healthy`. Image ~339 MB (bun-slim base + prod node_modules).

Layout/conventions:

- `Dockerfile` is two-stage on `oven/bun:1-slim`. Both stages install with
  `--ignore-scripts` (mirrors bunx; better-sqlite3's postinstall never runs and
  isn't needed — runtime uses `bun:sqlite`). Runtime stage: prod deps +
  `dist/` + `bin/`, `CMD bun bin/agenticket.js start --foreground` as PID 1.
- `ENV AGENTICKET_DATA_DIR=/data` (VOLUME) and `AGENTICKET_HOST=0.0.0.0` baked
  in; port overridable via `AGENTICKET_PORT` (HEALTHCHECK reads it too — it's a
  shell-form `bun -e` fetch, since the slim image has no curl).
- No lockfile is copied into the image (repo has package-lock.json, not
  bun.lock), so image builds resolve semver-fresh. Acceptable for now; pin
  later if reproducibility matters.
- CI: new `docker` job in `.github/workflows/ci.yml` runs the same smoke
  (build, run, token, MCP call, restart-persistence).
- `README.md` created with npx/bunx + docker quickstarts and an MCP pointer;
  full docs remain phase 7.

Phase 6 (web UI) notes: server binds fine behind docker; the UI phase only
touches `src/` — remember `docker-compose.yml` at repo root is user-facing
example config, keep it working.
