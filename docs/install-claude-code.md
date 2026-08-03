# agenticket + Claude Code

## 1. Run agenticket

```sh
npx agenticket start          # or bunx / docker, see the README
```

## 2. Connect Claude Code (one command)

```sh
npx agenticket install claude
```

This mints a fresh agent token and runs `claude mcp add` for you. Add
`--scope project` (writes `.mcp.json`, shareable with your team) or
`--scope user` (available everywhere); the default is local scope. Verify with
`/mcp` inside Claude Code — you should see the 11 `agenticket` tools.

If the `claude` CLI isn't on your PATH the command prints the manual
equivalent instead:

```sh
npx agenticket token create my-agent   # → agt_... (shown exactly once)
claude mcp add --transport http agenticket http://localhost:3547/mcp \
  --header "Authorization: Bearer agt_..."
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
