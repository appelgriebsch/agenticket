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

**Phase 9 implemented, awaiting user sign-off on the new UI** (last
verification item). Phase 8 was reviewed implicitly by the go-ahead to
continue.

## Phase index

| Phase | File | Status |
|---|---|---|
| 0 | [phase-0-scaffolding.md](phase-0-scaffolding.md) | ✅ done (2026-08-03) |
| 1 | [phase-1-db-domain.md](phase-1-db-domain.md) | ✅ done (2026-08-03) |
| 2 | [phase-2-rest-api.md](phase-2-rest-api.md) | ✅ done (2026-08-03) |
| 3 | [phase-3-mcp.md](phase-3-mcp.md) | ✅ done (2026-08-03) |
| 4 | [phase-4-cli-packaging.md](phase-4-cli-packaging.md) | ✅ done (2026-08-03) |
| 5 | [phase-5-docker.md](phase-5-docker.md) | ✅ done (2026-08-03) |
| 6 | [phase-6-web-ui.md](phase-6-web-ui.md) | ✅ done (2026-08-03) |
| 7 | [phase-7-skill-docs.md](phase-7-skill-docs.md) | ✅ done (2026-08-03) |
| 8 | [phase-8-install-command.md](phase-8-install-command.md) | ✅ done (2026-08-04) |
| 9 | [phase-9-ui-tailwind.md](phase-9-ui-tailwind.md) | 🔎 awaiting UI sign-off |

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
- **2026-08-03** Pidfile is owned by the foreground server process (not the daemon parent): written on boot, removed on graceful shutdown — so Docker's `start --foreground` gets `status`/`stop` for free. Line 2 of the pidfile records the actually-bound `host:port` so `status` never lies when flags overrode config.
- **2026-08-03** Docker image: two-stage on `oven/bun:1-slim`, both stages `bun install --ignore-scripts` (runtime uses `bun:sqlite`; better-sqlite3 postinstall never needed). HEALTHCHECK is shell-form `bun -e` fetch reading `AGENTICKET_PORT` (no curl in slim image). No lockfile copied into the image — builds resolve semver-fresh for now.
- **2026-08-03** Web UI design (phase 6): user rejected the strict-TUI first mock —
  final direction is full-width, 16px base, sans-serif body with mono reserved for
  keys/data, dark ground + amber accent, generous spacing; "terminal as flavor, not
  constraint". Amber consistently marks agent identity (⚡name) vs human (@name).
- **2026-08-03** Web UI implementation: CSS + enhancement JS embedded as strings
  (`src/web/assets.ts`) and served from memory — no static folder to resolve at
  runtime. Forms-first (works without JS) + ~20-line progressive enhancement.
  Token plaintext is rendered directly into the create response, never a URL.
  `IssueSummary` now exposes `assigneeType`.
- **2026-08-03** better-sqlite3 pinned to **^12.11.1**: v13 requires Node >=22 and
  segfaults on Node 20 (npm doesn't enforce engines). Do not bump to 13 until the
  project drops Node 20. v0.1.0 on npm shipped with 13 and is broken on Node 20;
  fixed in v0.1.1.
- **2026-08-03** Release automation: `.github/workflows/release.yml` on `v*` tags —
  verify (both runtimes + all smokes + tag/version guard) → npm publish (NPM_TOKEN)
  → GitHub release. CI + release pin npm@11 (lockfile format); docker smoke greps
  for plain substrings because MCP tool results escape quotes inside `text`.
- **2026-08-03** smoke-pack's Bun leg installs with `bun add --ignore-scripts` to mirror real `bunx`: better-sqlite3's postinstall never runs under Bun (plain `bun add` would fail on node-gyp), which is exactly the scenario the dynamic-driver rule protects.

- **2026-08-04** Web UI direction (phase 9, supersedes the phase-6
  terminal-flavor decision): standard, simple product look built with
  **Tailwind 4** — light + dark via `prefers-color-scheme`, amber kept as the
  accent/agent color, purple for epics. Tailwind runs at build time only:
  `npm run css:generate` compiles `src/web/app.css` and embeds it as committed
  `src/web/app.css.gen.ts` (same pattern as migrations); runtime and CI never
  need Tailwind.

## Standing rules (apply in every phase)

1. All mutations go through `src/domain/` functions taking an **actor context**
   (`{type: 'agent'|'human', tokenId?, name}`) so audit fields are never skipped.
   REST and MCP are thin adapters over the same domain layer.
2. Never statically import `better-sqlite3` or `bun:sqlite` — dynamic import inside
   the runtime branch in `src/db/connect.ts` only.
3. Migrations are **embedded as generated code** (`src/db/migrations.gen.ts`, produced
   by `scripts/embed-migrations.mjs`, wired into `npm run db:generate`) — no folder to
   resolve at runtime. Schema change workflow: edit `src/db/schema.ts` →
   `npm run db:generate` → commit the .sql, meta journal, and regenerated .gen.ts.
4. Keep SQLite transactions short (sync driver blocks the event loop).
5. Issue identity in all external surfaces (MCP, REST, UI, CLI) is the **key**
   (`AGT-42`), never the internal integer id.

## Progress log

- **2026-08-03** Project kicked off. Plan agreed with user; phases seeded.
- **2026-08-03** Phase 0 complete and verified (build/test/typecheck/lint green; hello
  server + `--version` verified under Node 26 and Bun 1.3). Initial commit made.
- **2026-08-03** Phase 1 complete: schema + dual-driver connect + embedded migrations
  (as generated code, see decision below) + full domain layer, 15 tests green, WAL
  smoke passed on both runtimes.
- **2026-08-03** Phase 2 complete: full `/api/v1` REST surface + session/bearer auth,
  shared zod schemas in `src/domain/schemas.ts`, 21 new integration tests (36 total),
  manual curl smoke green under Node and Bun.
- **2026-08-03** Phase 3 complete: stateless Streamable HTTP MCP at `POST /mcp`
  (`src/mcp/`), 11 tools over the domain layer, bearer-token auth before the
  transport, 7 new tests (43 total) incl. 8-client concurrency; scripted session
  green under both runtimes via `scripts/smoke-mcp.mjs`.
- **2026-08-03** Phase 4 complete: full CLI (start/stop/restart/status, config,
  token create|list|revoke, admin set-password), daemonization with pidfile +
  health-wait, config.json with flags>env>file>defaults precedence, graceful
  SIGTERM (close HTTP → WAL checkpoint → remove pidfile), `scripts/smoke-pack.sh`
  green under npx AND bunx, GitHub Actions CI added. 48 tests total.
- **2026-08-03** Phase 5 complete: two-stage Dockerfile (bun-slim), compose
  example, README quickstart, CI `docker` job. Verified locally: build → run →
  healthz → token via exec → MCP call from host → restart with data intact →
  HEALTHCHECK healthy.

- **2026-08-03** Phase 6 complete: full web UI (`src/web/`) — login, project list
  + create, issue list (epic tree, command-line filters, derived blocked flags),
  issue detail (status/priority controls, comments with agent attribution),
  ready queue, token admin (create shows plaintext once, revoke). 62 tests total;
  live walkthrough verified on Node and smoke-tested on Bun.
- **2026-08-03** Phase 7 complete: `skill/SKILL.md` (agent workflow skill),
  install docs for Claude Code / Codex / generic MCP clients, full README,
  skill+docs wired into the npm tarball, `scripts/smoke-skill.mjs` dogfood
  (two concurrent MCP agents follow the skill loop end-to-end, audit trail
  verified through the web UI; green under Node and Bun). Tagged v0.1.0.
- **2026-08-03** First working release shipped: **agenticket@0.1.1 on npm** via the
  release workflow (v0.1.0 published but segfaulted on Node 20 — better-sqlite3 13;
  superseded same day). CI made green end to end: npm@11 lockfile pin, docker smoke
  grep fix (escaped MCP text), better-sqlite3 ^12.11.1, build step gated to Node
  >=22. Verified from the public registry: `npx agenticket@0.1.1` on Node 20
  (container) serves healthz + MCP tool calls; host start/stop clean.

- **2026-08-04** Phase 8 complete: `agenticket install claude|codex|json`
  (`src/cli/install.ts`) — mints a token automatically, shells out to
  `claude mcp add` (with manual fallback on failure), section-upserts
  `~/.codex/config.toml` (honors `CODEX_HOME`), or prints a pipeable
  `mcpServers` JSON block (JSON on stdout, notes on stderr). Default URL
  prefers the running server's bound address from the pidfile. Docs + README
  updated. 72 tests; live smoke on Node + Bun.

- **2026-08-04** Phase 9 implemented: web UI rebuilt on Tailwind 4 — standard
  light+dark design (system preference), amber accent, purple epics, inline
  utilities + small component layer (`.btn/.input/.st-*`). Build wiring:
  `scripts/embed-css.mjs` + committed `app.css.gen.ts`. 72 tests green;
  walkthrough on Node + Bun smoke. Awaiting user sign-off on the look.

- **2026-08-04** **v0.2.2 released** (npm + GitHub) with phases 8+9. Two failed
  release attempts first: v0.2.0 (Biome rejects Tailwind `@apply` — fixed with
  `css.parser.tailwindDirectives`) and v0.2.1 (Biome formatter rejects the
  generated `app.css.gen.ts` — now excluded; plus smoke-skill's UI marker
  needed the new ⚡ prefix). Both dead tags remain on GitHub, never published.
  Lesson recorded: before tagging, run the FULL verify job locally without
  pipes (`lint; typecheck; test; build; all 6 smokes; smoke-pack`) — piping
  lint output through `tail` had masked its exit code.

## Handoff notes for next phase

All planned phases are done. The publish checklist lives in the phase-7 handoff
notes. If new work starts, add a phase file and update the index above first.
