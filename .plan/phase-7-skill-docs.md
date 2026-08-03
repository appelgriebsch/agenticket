# Phase 7 — Skill + Docs

## Goal

Make agenticket trivially adoptable: a Claude Code skill that teaches agents the
workflow, install guides for common harnesses, and a real README.

## Tasks

- [x] `skill/SKILL.md` — Claude Code skill teaching the loop:
      1. `ready_work` to pick the highest-priority unblocked issue
      2. claim it: `update_issue` status=in_progress, assignee=<agent name>
      3. narrate progress with `add_comment` (decisions, findings)
      4. discover new work → `create_issue` + `link_issues` (blocks/depends_on)
      5. `close_issue` (mentions newly unblocked issues) → loop to 1
      Conventions: keys not ids; when truly stuck externally, set status=blocked with
      a comment saying on what; never leave in_progress issues silently.
- [x] `docs/install-claude-code.md` —
      `claude mcp add --transport http agenticket http://HOST:3547/mcp --header "Authorization: Bearer agt_..."`
      plus skill installation
- [x] `docs/install-codex.md` — Codex MCP config (TOML) equivalent
- [x] `docs/install-generic.md` — plain Streamable HTTP MCP JSON snippet for any client
- [x] `README.md` — pitch, quickstart (npx, bunx, docker), CLI reference, MCP tools
      table, REST overview, self-hosting notes (WAL lives in /data; litestream works
      against the data dir if backup wanted)
- [x] Wire `skill/` + `docs/` into package `files` — verified in `npm pack --dry-run`

## Verification (dogfood)

- [x] Scripted end-to-end scenario following SKILL.md's loop verbatim —
      `scripts/smoke-skill.mjs` (real MCP HTTP clients against a live instance):
      ready_work → claim → comment → create blocking issue + link → derived
      blockedBy drops DOG-1 from ready → close blocker (unblocked reported) →
      close original → next ready item correct; audit trail then verified through
      the web UI (admin login, agent-attributed comments, done badge, filter).
      Green under Node (tsx) AND Bun. (Run as a scripted MCP session rather than
      an interactive Claude Code process so it is repeatable in CI.)
- [x] Second agent (own token) connected simultaneously: 15 create/comment/close
      cycles interleaved with the skill loop via Promise.all — no conflicts (WAL).

## Handoff notes

- Deliverables: `skill/SKILL.md`, `docs/install-{claude-code,codex,generic}.md`,
  rewritten `README.md`, `scripts/smoke-skill.mjs`; `skill/` + `docs/` ship in
  the npm tarball (`files` in package.json).
- v0.1.0 tagged at the phase-7 commit.
- Publish checklist (when ready): `npm run build && npm test && npm run typecheck
  && npm run lint` → `bash scripts/smoke-pack.sh` (npx + bunx legs) →
  `npx tsx scripts/smoke-skill.mjs && bun scripts/smoke-skill.mjs` →
  `npm pack --dry-run` sanity (bin, dist, skill, docs) → `npm publish` →
  `docker build` + push image → GitHub release notes from the phase log.
