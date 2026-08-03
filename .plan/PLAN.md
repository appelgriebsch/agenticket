# Agenticket — Development Plan & Memory

This file is the communication bridge between phases: it records the current phase,
decisions made, what was completed and how it was verified, and handoff notes for
whoever (human or agent) picks up the next phase. **Update it at the end of every phase.**

## Product vision

Agent-first issue tracker (beads-like, simpler). AI agents are the primary users via a
built-in Streamable HTTP MCP endpoint; humans log into a terminal-styled web UI to
observe and manage. Distributed as an npm package (`npx`/`bunx agenticket start`) and a
single-container Docker image.

## Current phase

**Phase 1 — DB + domain** (next up; awaiting user go-ahead)

## Phase index

| Phase | File | Status |
|---|---|---|
| 0 | [phase-0-scaffolding.md](phase-0-scaffolding.md) | ✅ done (2026-08-03) |
| 1 | [phase-1-db-domain.md](phase-1-db-domain.md) | pending |
| 2 | [phase-2-rest-api.md](phase-2-rest-api.md) | pending |
| 3 | [phase-3-mcp.md](phase-3-mcp.md) | pending |
| 4 | [phase-4-cli-packaging.md](phase-4-cli-packaging.md) | pending |
| 5 | [phase-5-docker.md](phase-5-docker.md) | pending |
| 6 | [phase-6-web-ui.md](phase-6-web-ui.md) | pending |
| 7 | [phase-7-skill-docs.md](phase-7-skill-docs.md) | pending |

Work strictly one phase at a time. Each phase file has a goal, task list, out-of-scope
list, and a verification checklist — a phase is done only when every verification item
passes. **Stop at the end of each phase for user review before starting the next.**

## Decision log

- **2026-08-03** Runtime: TypeScript, ESM-only, runs on Node >=20 AND Bun (npx + bunx).
- **2026-08-03** Stack: Hono (HTTP), Drizzle ORM, SQLite with WAL. Build: tsdown. Tests: vitest. Lint/format: biome.
- **2026-08-03** SQLite drivers: `better-sqlite3` under Node, `bun:sqlite` under Bun, chosen at runtime in `src/db/connect.ts`. **Dynamic imports only** — a static import of `better-sqlite3` breaks `bunx` (Bun skips its postinstall; the native binary won't exist).
- **2026-08-03** MCP: Streamable HTTP endpoint (`POST /mcp`) built into the server via `@hono/mcp` + `@modelcontextprotocol/sdk`, **stateless** (fresh McpServer per request). Per-agent bearer tokens (`agt_...`) created via CLI; token identity stamped on issues/comments for audit.
- **2026-08-03** Data model: Projects > Epics > Issues (fixed 3 levels). **Epics are `issues` rows with `kind='epic'`** — reuses comments/labels/links/audit. Typed links: blocks, depends_on, relates_to, duplicates (`blocked_by` accepted as input sugar, stored inverted).
- **2026-08-03** Statuses fixed for now (open, in_progress, blocked, in_review, done, cancelled) but stored as a **catalog table** (`statuses` with nullable `project_id` + `category` todo/active/done) so per-project configurable statuses later require no schema migration.
- **2026-08-03** "Blocked" is **derived** from open `blocks` links, never auto-stored; the manual `blocked` status is only for external blockers. Avoids stale-flag bugs.
- **2026-08-03** Human auth: single admin password + session cookie. Agent auth: bearer tokens.
- **2026-08-03** Web UI (phase 6): Hono JSX SSR, terminal aesthetic, minimal client JS. Design pass happens at the start of that phase.
- **2026-08-03** Default port 3547, default bind 127.0.0.1. Data dir via env-paths (`~/.local/share/agenticket`), override with `AGENTICKET_DATA_DIR`.

## Standing rules (apply in every phase)

1. All mutations go through `src/domain/` functions taking an **actor context**
   (`{type: 'agent'|'human', tokenId?, name}`) so audit fields are never skipped.
   REST and MCP are thin adapters over the same domain layer.
2. Never statically import `better-sqlite3` or `bun:sqlite` — dynamic import inside
   the runtime branch in `src/db/connect.ts` only.
3. Migrations ship inside `dist/` and are resolved via `new URL(..., import.meta.url)`,
   never `process.cwd()`.
4. Keep SQLite transactions short (sync driver blocks the event loop).
5. Issue identity in all external surfaces (MCP, REST, UI, CLI) is the **key**
   (`AGT-42`), never the internal integer id.

## Progress log

- **2026-08-03** Project kicked off. Plan agreed with user; phases seeded.
- **2026-08-03** Phase 0 complete and verified (build/test/typecheck/lint green; hello
  server + `--version` verified under Node 26 and Bun 1.3). Initial commit made.

## Handoff notes for next phase

See "Handoff notes" in phase-0-scaffolding.md — key items: use tsdown `copy` option for
migrations into dist; runtime-detect pattern to reuse lives in `src/serve.ts`.
