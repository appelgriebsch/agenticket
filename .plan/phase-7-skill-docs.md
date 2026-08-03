# Phase 7 — Skill + Docs

## Goal

Make agenticket trivially adoptable: a Claude Code skill that teaches agents the
workflow, install guides for common harnesses, and a real README.

## Tasks

- [ ] `skill/SKILL.md` — Claude Code skill teaching the loop:
      1. `ready_work` to pick the highest-priority unblocked issue
      2. claim it: `update_issue` status=in_progress, assignee=<agent name>
      3. narrate progress with `add_comment` (decisions, findings)
      4. discover new work → `create_issue` + `link_issues` (blocks/depends_on)
      5. `close_issue` (mentions newly unblocked issues) → loop to 1
      Conventions: keys not ids; when truly stuck externally, set status=blocked with
      a comment saying on what; never leave in_progress issues silently.
- [ ] `docs/install-claude-code.md` —
      `claude mcp add --transport http agenticket http://HOST:3547/mcp --header "Authorization: Bearer agt_..."`
      plus skill installation
- [ ] `docs/install-codex.md` — Codex MCP config (TOML) equivalent
- [ ] `docs/install-generic.md` — plain Streamable HTTP MCP JSON snippet for any client
- [ ] `README.md` — pitch, quickstart (npx, bunx, docker), CLI reference, MCP tools
      table, REST overview, self-hosting notes (WAL lives in /data; litestream works
      against the data dir if backup wanted)
- [ ] Wire `skill/` + `docs/` into package `files` if they should ship in the tarball

## Verification (dogfood)

- Live instance + fresh token; a Claude Code session with the skill installed
  completes a scripted scenario end-to-end: finds ready work, claims, comments,
  creates a blocking sub-issue, closes both, correct audit trail visible in UI.
- A second agent connected simultaneously does not conflict (WAL concurrency).

## Handoff notes

_(final wrap-up: version 0.1.0 tag, publish checklist)_
