# Phase 0 — Scaffolding

## Goal

A buildable, testable, lintable TypeScript package skeleton that starts a hello-world
Hono server under **both** Node (`node`/`npx`) and Bun (`bun`/`bunx`), with the `.plan/`
process seeded.

## Tasks

- [x] `git init` (branch `main`)
- [x] `package.json`: name `agenticket`, ESM (`"type": "module"`), `bin` → `bin/agenticket.js`, `files: [bin, dist]`, `engines.node >= 20`
- [x] Dependencies: hono, @hono/node-server, drizzle-orm, better-sqlite3, commander, env-paths, zod, @modelcontextprotocol/sdk, @hono/mcp
- [x] Dev deps: typescript, tsdown, tsx, vitest, biome, drizzle-kit, @types/*
- [x] `tsconfig.json` (strict, bundler resolution, hono/jsx for later UI phase)
- [x] `tsdown.config.ts` — entries `src/cli/index.ts` + `src/server.ts`, ESM, externals: `better-sqlite3`, `bun:sqlite`
- [x] `vitest.config.ts`, `biome.json`, `.gitignore`
- [x] `bin/agenticket.js` shim → `dist/cli/index.js`
- [x] `src/server.ts` — `createApp()` exporting a Hono app with `GET /healthz`
- [x] `src/serve.ts` — runtime-detecting listener (Bun.serve vs @hono/node-server)
- [x] `src/cli/index.ts` — commander skeleton: `--version`, `start --port --host --foreground`
- [x] First test: `tests/server.test.ts` via `app.request()`
- [x] `.plan/` seeded: PLAN.md + all phase files
- [x] Initial git commit

## Out of scope

Database, auth, MCP, daemonization (start runs foreground-only for now), Docker, UI.

## Verification checklist

```sh
npm run build                          # tsdown succeeds
npm test                               # vitest green
npm run typecheck                      # tsc --noEmit clean
npm run lint                           # biome clean
node bin/agenticket.js --version       # prints 0.1.0
bun  bin/agenticket.js --version       # prints 0.1.0 (Bun path works)
# hello server on both runtimes:
node bin/agenticket.js start --foreground --port 3547 &  curl -s localhost:3547/healthz  # {"ok":true,...}
bun  bin/agenticket.js start --foreground --port 3548 &  curl -s localhost:3548/healthz
```

## Handoff notes

**Completed 2026-08-03.** All verification items passed: build (tsdown → dist/*.js),
vitest (1 test), tsc clean, biome clean, `--version` and `/healthz` verified under both
Node 26 and Bun 1.3.

Notes for phase 1:
- tsdown's `external` option is deprecated → we use `deps.neverBundle` (better-sqlite3,
  bun:sqlite already listed). When adding the migrations folder, tsdown does NOT copy
  non-imported assets — add a `copy` step or use tsdown's `copy` option for
  `src/db/migrations` → `dist/db/migrations`, and verify presence in `dist/` in the
  phase 1 checklist.
- `outExtensions` forces `.js` (default was `.mjs`); bin shim imports `dist/cli/index.js`.
- `src/serve.ts` has the runtime-detect pattern (typeof Bun) to copy for `db/connect.ts`.
- Version comes from `src/version.ts` importing package.json (inlined at build).
