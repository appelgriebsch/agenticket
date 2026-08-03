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

- [ ] `src/mcp/server.ts` — buildMcpServer(db, actor) registering all tools
- [ ] `src/mcp/route.ts` — Hono route wiring auth + transport (stateless per-request)
- [ ] Shared zod schemas from `src/domain/schemas.ts`
- [ ] Tool results: concise JSON text content; errors as MCP tool errors with
      actionable messages (e.g. "AGT-99 not found; use list_issues")
- [ ] Integration tests: real `@modelcontextprotocol/sdk` Client +
      `StreamableHTTPClientTransport` against a live ephemeral-port server —
      scripted session: create_project → create epic → create issues under epic →
      link blocks → ready_work excludes blocked → close_issue → ready_work now
      includes unblocked; also 401 without token
- [ ] Concurrency smoke test: N parallel MCP clients creating issues (validates WAL
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

_(fill in when phase completes)_
