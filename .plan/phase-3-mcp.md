# Phase 3 — MCP Endpoint + Agent Tokens

## Goal

Streamable HTTP MCP at `POST /mcp` on the same server, stateless, bearer-token
authenticated, exposing 11 agent-ergonomic tools over the domain layer.

## Design

- `@hono/mcp` (`StreamableHTTPTransport`) + `@modelcontextprotocol/sdk` `McpServer`.
- **Stateless**: build a fresh McpServer + transport per request; no session ids.
  Cost: no server-initiated notifications — fine for a tool-only surface.
- Auth middleware (reuse phase 2 bearer path) runs BEFORE the transport; rejects
  without a valid `agt_` token. Token identity → Actor → audit fields.
- All tools speak issue **keys** ("AGT-42"), never internal ids.
- Every zod param gets `.describe()`; tool descriptions written for agents
  (when to use, what comes back).

## Tool surface

| Tool | Params |
|---|---|
| `list_projects` | — |
| `create_project` | key, name, description? |
| `create_issue` | project, title, description?, kind?('issue'\|'epic'), epic?, priority?(0-4), labels?[], assignee? |
| `get_issue` | key → full issue + comments + links + computed blocked_by/blocks |
| `update_issue` | key + partial: title?, description?, status?, priority?, epic?, assignee?, add_labels?[], remove_labels?[] |
| `list_issues` | project?, status?[], kind?, epic?, assignee?, labels?[], text?, limit?, offset? → compact rows |
| `ready_work` | project?, assignee?, limit? → unblocked open issues, priority-ordered |
| `link_issues` | from, to, type('blocks'\|'blocked_by'\|'depends_on'\|'relates_to'\|'duplicates') — blocked_by stored inverted |
| `unlink_issues` | from, to, type |
| `add_comment` | issue, body |
| `close_issue` | issue, status?('done'\|'cancelled'=done), comment? → also returns issues newly unblocked |

No delete tools for agents (audit trail preservation); humans delete via UI/API.

## Tasks

- [x] `src/mcp/server.ts` — buildMcpServer(db, actor) registering all tools
- [x] `src/mcp/route.ts` — Hono route wiring auth + transport (stateless per-request)
- [x] Shared zod schemas from `src/domain/schemas.ts`
- [x] Tool results: concise JSON text content; errors as MCP tool errors with
      actionable messages (e.g. "AGT-99 not found; use list_issues")
- [x] Integration tests: real `@modelcontextprotocol/sdk` Client +
      `StreamableHTTPClientTransport` against a live ephemeral-port server —
      scripted session: create_project → create epic → create issues under epic →
      link blocks → ready_work excludes blocked → close_issue → ready_work now
      includes unblocked; also 401 without token
- [x] Concurrency smoke test: N parallel MCP clients creating issues (validates WAL
      + busy_timeout + atomic numbering)

## Out of scope

CLI `token create` UX (phase 4; use domain/auth functions directly in tests),
install docs (phase 7).

## Risks

`@hono/mcp` is v0.x — pinned. Fallback if it breaks: wire the SDK's transport
manually via fetch adapters (note kept here per plan).

## Verification checklist

```sh
npm test    # MCP integration + concurrency suites green (Node)
# same scripted MCP session executed under Bun runtime
```

## Handoff notes

**Completed 2026-08-03.** Verification: `npm test` 43/43 green (7 new MCP tests incl.
8-client/40-issue concurrency), lint/typecheck/build green, and the scripted session
run via `scripts/smoke-mcp.mjs` under BOTH `npx tsx` and `bun` (also checks the 401).

Layout:
- `src/mcp/server.ts` — `buildMcpServer(db, actor)`: registers the 11 tools; a `run()`
  helper converts `DomainError` → MCP tool error (`isError: true`) and appends a
  discovery hint on `not_found`. Results are pretty-printed JSON text content.
- `src/mcp/route.ts` — `createMcpRoute(db)`: bearer-only auth (no session cookies on
  the MCP surface) BEFORE the transport; fresh `McpServer` +
  `StreamableHTTPTransport({ sessionIdGenerator: undefined })` per request (stateless).
  401 body is a JSON-RPC error envelope.
- Mounted in `src/server.ts` via `app.route("/mcp", ...)`.

Conventions phase 4+ should know:
- MCP param names are snake_case where the phase spec said so (`add_labels`,
  `remove_labels`); they map to the domain's `addLabels`/`removeLabels`.
- Tool input validation reuses field schemas from `src/domain/schemas.ts` via
  `.shape.X.describe(...)` — constraints stay identical to REST.
- `close_issue` accepts an optional `comment` (added before closing) and returns the
  issue plus `unblocked: string[]`.
- Agents get no delete tools (audit preservation) — deletes remain admin-only REST.
- Phase 4 (CLI): `agenticket token create <name>` should call `createToken` in
  `src/auth/tokens.ts` and print the one-time plaintext; MCP connect docs belong in
  phase 7.
