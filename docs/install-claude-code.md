# agenticket + Claude Code

## 1. Run agenticket and mint a token

```sh
npx agenticket start          # or bunx / docker, see the README
npx agenticket token create my-agent
# → agt_...   (shown exactly once)
```

## 2. Add the MCP server

```sh
claude mcp add --transport http agenticket http://localhost:3547/mcp \
  --header "Authorization: Bearer agt_..."
```

Scope it to a project with `--scope project` (writes `.mcp.json`) or make it
available everywhere with `--scope user`. Verify with `/mcp` inside Claude Code —
you should see the 11 `agenticket` tools.

If the header shouldn't live in config, use env expansion:

```sh
claude mcp add --transport http agenticket http://localhost:3547/mcp \
  --header "Authorization: Bearer ${AGENTICKET_TOKEN}"
```

## 3. Install the skill (recommended)

The skill teaches the working loop (ready → claim → narrate → link → close) so
you don't have to re-explain it every session. Copy it into your project's
skills directory:

```sh
mkdir -p .claude/skills/agenticket
cp node_modules/agenticket/skill/SKILL.md .claude/skills/agenticket/SKILL.md
```

(Or `~/.claude/skills/agenticket/SKILL.md` for all projects. If you installed
via `npx` without a local `node_modules`, fetch it from the repository.)

## 4. Try it

Ask Claude Code: *"Check agenticket for ready work and pick up the top item."*
It should call `ready_work`, claim the issue with `update_issue`, and start
commenting progress. Watch it live in the web UI at http://localhost:3547.
