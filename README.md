# agenticket

<img width="2610" height="1588" alt="image" src="https://github.com/user-attachments/assets/373b8ee6-6be7-493b-9879-f7191cc13e83" />

**Agent-first issue tracker.** AI agents are the primary users — they plan,
claim, link, and close issues over a built-in MCP server — while humans observe
and manage through a dark, keyboard-friendly web UI. One process, one SQLite
file, runs under Node and Bun.

- **MCP built in** — stateless Streamable HTTP endpoint at `POST /mcp`, 11 tools,
  per-agent bearer tokens; every mutation is attributed to the token that made it.
- **Dependency-aware** — `blocks` / `depends_on` links form a DAG (cycles
  rejected); "blocked" is *derived* from open blockers, never a stale flag, and
  `ready_work` hands agents the highest-priority unblocked issue.
- **Structured enough, no more** — Projects → Epics → Issues, six fixed
  statuses, five priorities, labels, comments.
- **Trivial to run** — `npx agenticket start`, `bunx agenticket start`, or a
  single container. Data is one SQLite database (WAL) in a directory you can
  back up with `cp`.

## Quickstart

### npx / bunx

```sh
npx agenticket start                 # daemon on 127.0.0.1:3547
npx agenticket admin set-password    # for the web UI login
npx agenticket install claude        # connect Claude Code (mints a token, runs claude mcp add)
```

`install codex` writes `~/.codex/config.toml` instead; `install json` prints an
`mcpServers` block for any other harness (`token create <name>` still exists for
manual setups). Open http://localhost:3547 and see the guides —
[Claude Code](docs/install-claude-code.md) · [Codex](docs/install-codex.md) ·
[any MCP client](docs/install-generic.md).

### Docker

```sh
docker build -t agenticket:latest .
docker run -d --name agenticket -p 3547:3547 \
  -v agenticket-data:/data \
  -e AGENTICKET_ADMIN_PASSWORD=change-me \
  agenticket:latest

docker exec agenticket bun bin/agenticket.js token create my-agent
```

Or `docker compose up -d` (see `docker-compose.yml`). The image binds
`0.0.0.0:3547` internally, stores everything in the `/data` volume, and
`docker stop` shuts down gracefully (HTTP close → WAL checkpoint).

### Install via AI

Since agents are the primary users, let one install it. Paste this into
Claude Code, Codex, or any coding agent with shell access:

```text
Install agenticket (npm package "agenticket", repo
https://github.com/saeedvaziry/agenticket) on this machine and connect it to
yourself:

1. Start it: `npx agenticket start` (use `bunx` if this machine has Bun but
   not Node >= 20). Verify with `npx agenticket status` — it should report a
   daemon on 127.0.0.1:3547.
2. Connect your own harness. If you are Claude Code run
   `npx agenticket install claude`; if you are Codex run
   `npx agenticket install codex`. Otherwise run `npx agenticket install json`
   and merge the printed `mcpServers` block into your harness's MCP config
   (if your harness is stdio-only, bridge with `npx -y mcp-remote <url>
   --header "Authorization: Bearer <token>"`). Each of these mints a bearer
   token for you; never print the token in your summary.
3. Verify the connection: call the `agenticket` MCP tools (or curl
   `POST http://localhost:3547/mcp` with the Authorization header and a
   `tools/list` request) — expect 11 tools including `ready_work`.
4. Teach yourself the workflow: fetch
   https://raw.githubusercontent.com/saeedvaziry/agenticket/main/skill/SKILL.md
   — if you are Claude Code save it to .claude/skills/agenticket/SKILL.md;
   otherwise add its conventions (ready_work -> claim -> comment progress ->
   link discovered work -> close_issue) to your instructions file
   (AGENTS.md or equivalent).
5. Finish by telling me: the web UI is at http://localhost:3547, I should run
   `npx agenticket admin set-password` myself to log in (it's interactive),
   and which config file you registered the MCP server in.
```

The agent ends up connected over MCP with its own attributed token and the
workflow skill installed — ask it to "check agenticket for ready work" to
confirm.

## Teaching your agent the workflow

[`skill/SKILL.md`](skill/SKILL.md) is a ready-made Claude Code skill teaching
the loop: `ready_work` → claim (`update_issue` status/assignee) → narrate with
`add_comment` → file & link discovered work → `close_issue` (which reports what
got unblocked) → repeat. Install per the
[Claude Code guide](docs/install-claude-code.md); for other harnesses, paste its
conventions into your agent instructions.

## CLI

```text
agenticket start [-p port] [-H host] [--foreground]   start (daemon by default)
agenticket stop | restart | status                    manage the daemon
agenticket config list | get <key> | set <key> <val>  config.json in the data dir
agenticket install claude|codex|json [--name] [--url] [--scope]  connect a coding agent
agenticket token create|list|revoke <name>            agent bearer tokens
agenticket admin set-password                         web UI login password
```

Precedence for port/host: flags > `AGENTICKET_PORT`/`AGENTICKET_HOST` env >
`config.json` > defaults (`127.0.0.1:3547`). Data lives in
`~/.local/share/agenticket` (platform-dependent via env-paths); override with
`AGENTICKET_DATA_DIR`.

## MCP tools

Endpoint: `POST /mcp`, header `Authorization: Bearer agt_...` — stateless, so
any number of agents can work one instance concurrently.

| Tool | Purpose |
|---|---|
| `list_projects` / `create_project` | discover or create projects (key = issue prefix) |
| `create_issue` | new issue or epic (`kind: "epic"`), with labels/priority/assignee |
| `get_issue` | full detail: description, comments, links, derived `blockedBy` |
| `update_issue` | partial update: status, priority, epic, assignee, labels |
| `list_issues` | filter by project/status/kind/epic/assignee/labels/text |
| `ready_work` | open, unblocked issues by priority then age — "what's next" |
| `link_issues` / `unlink_issues` | `blocks`, `blocked_by`, `depends_on`, `relates_to`, `duplicates` |
| `add_comment` | progress notes; the audit trail agents and humans read |
| `close_issue` | done/cancelled + closing comment; returns newly `unblocked` keys |

No delete tools on purpose: agents can close and cancel but never destroy the
audit trail. Destructive deletes are admin-only (web UI / REST with a session).

## REST API

Everything the UI and MCP can do is also plain JSON under `/api/v1`, with the
same two auth modes: `Authorization: Bearer agt_...` or the admin session
cookie (`POST /api/v1/auth/login`).

```text
GET/POST        /api/v1/projects            GET/PATCH/DELETE /api/v1/projects/:key
GET/POST        /api/v1/projects/:key/labels
GET/POST        /api/v1/issues              GET/PATCH/DELETE /api/v1/issues/:key
GET/POST        /api/v1/issues/:key/comments
POST/DELETE     /api/v1/issues/:key/links
GET             /api/v1/ready
GET/POST        /api/v1/tokens              DELETE /api/v1/tokens/:id   (admin)
```

External surfaces always use issue keys (`AGT-42`); internal ids never leak.

## Web UI

Server-rendered, dark, fast — no SPA, works with JavaScript disabled. Pages:
project overview, per-project issue list (command-line style filters, epics as
trees, derived blocked flags), issue detail (status/priority controls, comments
with ⚡agent / @human attribution), the ready queue as agents see it, and token
admin (create shows the plaintext exactly once; revoke).

## Self-hosting notes

- Single process, single SQLite database in WAL mode; keep the whole data dir
  on one filesystem and back it up by copying it (or point
  [litestream](https://litestream.io) at the `.db` file for continuous
  replication — in Docker that's the `/data` volume).
- Bind stays `127.0.0.1` by default; put a TLS-terminating reverse proxy in
  front if you expose it (`agenticket config set host 0.0.0.0` inside
  containers/networks you trust).
- Runs under Node ≥ 20 (better-sqlite3) and Bun (bun:sqlite) — the right driver
  is picked at runtime.

## Development

```sh
npm test             # vitest
npm run typecheck    # tsc
npm run lint         # biome
npm run build        # tsdown → dist/
npm run db:generate  # after editing src/db/schema.ts (regenerates embedded migrations)
```

The `.plan/` directory documents the phase-by-phase build process and decisions.

MIT license.
