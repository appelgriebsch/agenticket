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

- [ ] `Dockerfile` (multi-stage, bun base)
- [ ] `.dockerignore`
- [ ] `docker-compose.yml` example in repo root (volume + env, for docs)
- [ ] README section: docker quickstart (full docs phase 7)

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

_(fill in when phase completes)_
