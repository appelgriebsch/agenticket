# Phase 8 — `agenticket install`: one-command MCP setup

## Goal

A user who has agenticket running can connect a coding agent with a single command:

```sh
npx agenticket install claude   # configures Claude Code via `claude mcp add`
npx agenticket install codex    # writes [mcp_servers.agenticket] into ~/.codex/config.toml
npx agenticket install json     # prints an mcpServers JSON block for any other harness
```

Every variant mints a fresh agent bearer token automatically (no separate
`token create` step) and points the client at the local MCP endpoint.

## Design

- **Command**: `install <target>` where target ∈ `claude | codex | json`.
  Options:
  - `--name <name>` — token name (default: `claude-code` / `codex` / `mcp`);
    auto-suffix `-2`, `-3`… if the name is taken (token names are unique).
  - `--url <url>` — MCP endpoint override; default built from the resolved
    config: `http://{pollHost(host)}:{port}/mcp`.
  - `--scope <local|user|project>` — Claude Code only, passed to `claude mcp add`
    (default: local, i.e. flag omitted).
- **claude**: shell out to
  `claude mcp add --transport http agenticket <url> --header "Authorization: Bearer <tok>"`.
  If the `claude` binary is missing (ENOENT) or exits non-zero, print the exact
  command plus the JSON block so the user can finish manually (exit 1).
- **codex**: `codex mcp add --url` cannot set auth headers, so edit
  `~/.codex/config.toml` directly: replace an existing `[mcp_servers.agenticket]`
  section (textual section-replace: from the header line to the next `[` line or
  EOF) or append one. Block shape:
  ```toml
  [mcp_servers.agenticket]
  url = "http://127.0.0.1:3547/mcp"
  http_headers = { "Authorization" = "Bearer agt_..." }
  ```
- **json**: stdout gets ONLY the JSON (pipe-friendly); human notes go to stderr.
  ```json
  { "mcpServers": { "agenticket": { "type": "http", "url": "...", "headers": { "Authorization": "Bearer agt_..." } } } }
  ```
- All variants warn on stderr when the server isn't running
  (`runningPid === null`): "start it with `npx agenticket start`".
- Pure helpers (JSON builder, TOML block builder, TOML section replace, claude
  argv builder, token-name dedupe) live in `src/cli/install.ts` and are
  unit-tested; the command action wires them to db/config.

## Tasks

- [x] `src/cli/install.ts` — pure helpers + command registration
- [x] Wire into `src/cli/index.ts`
- [x] `tests/install.test.ts` — helpers (JSON shape, TOML append + replace,
      argv, name dedupe) and a CLI-level `install json` run against a temp
      data dir
- [x] Update `docs/install-claude-code.md`, `docs/install-codex.md`,
      `docs/install-generic.md`, and README quickstart to lead with
      `npx agenticket install …` (keep manual paths as fallback)

## Out of scope

- OAuth / `bearer_token_env_var` flows; remote (non-localhost) hardening
- Windows-specific config paths beyond `os.homedir()` join
- Installing the skill file (still documented manually)

## Verification checklist

- [x] `npm test` (72), `npm run typecheck`, `npm run lint`, `npm run build` green
- [x] `install json` on a fresh temp data dir prints valid JSON with a working
      token (verified live: `tools/list` over `/mcp` with the minted token)
- [x] `install codex` with temp `CODEX_HOME`: creates config.toml, re-running
      replaces (not duplicates) the section, unrelated sections untouched
      (vitest + live)
- [x] `install claude` prints graceful fallback (manual command + JSON, exit 1)
      when `claude` is absent — verified live with node-only PATH
- [x] Works under Bun: `bun bin/agenticket.js install json` produces valid JSON

## Handoff

- Done as designed, one addition found during live smoke: the default URL now
  prefers the **running server's actually-bound address** (pidfile line 2, via
  `runningPid`/`runningAddress`) over `resolveConfig` — `start -p 3599` isn't
  persisted to config.json, so config-only resolution pointed at the wrong port.
  Regression test covers it.
- `install claude` was NOT run against a real `claude` binary (would touch the
  developer's real Claude Code config); the spawn path is exercised via the
  injected `runClaude` seam + live ENOENT fallback. Worth one manual run on a
  scratch machine before release.
- Codex TOML editing is textual section-replace on `[mcp_servers.agenticket]`
  only; `codex mcp add --url` was rejected because it cannot set auth headers.
