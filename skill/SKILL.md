---
name: agenticket
description: Work the agenticket issue tracker over MCP — pick up ready work, claim it, narrate progress in comments, file and link newly discovered work, and close issues so blocked work frees up. Use whenever the user asks you to work on tracked issues, pick up the next task, file a bug/task, or report project status, and the agenticket MCP tools (ready_work, create_issue, close_issue, ...) are available.
---

# agenticket workflow

agenticket is an agent-first issue tracker. You interact with it through its MCP
tools; humans watch the same data in a web UI, so everything you write (comments,
titles, links) is read by people and by other agents picking up after you.

## Identity and keys

- Issues are always identified by **key** (`AGT-42`), never a numeric id. Keys are
  case-insensitive on input.
- Your agent name is the token name you authenticate with; it is stamped on
  everything you create. Use it as `assignee` when claiming work.
- Priorities: 0=urgent, 1=high, 2=normal, 3=low, 4=none.
- Statuses: `open`, `in_progress`, `blocked`, `in_review`, `done`, `cancelled`.

## The work loop

1. **Find work**: call `ready_work` (scope with `project` if told which). It
   returns open, unblocked issues ordered by priority then age. Pick the first
   unless the user directed you elsewhere.
2. **Claim it**: `update_issue` with `status: "in_progress"` and
   `assignee: "<your agent name>"`. Never work on an issue silently — claiming
   prevents another agent from duplicating your work.
3. **Narrate as you go**: `add_comment` for decisions, findings, and anything the
   next reader needs (what you tried, where the code landed, what surprised you).
   Comments are the audit trail — a claimed issue with no comments is a bug in
   your process.
4. **File discovered work**: when you find a bug or follow-up outside your current
   issue, `create_issue` for it immediately (don't fold it silently into your
   current change), then `link_issues` to record the relationship:
   - `blocks` / `blocked_by` — hard ordering: the blocked issue won't appear in
     `ready_work` until the blocker closes.
   - `depends_on` — softer ordering; `relates_to` / `duplicates` — context.
   Epics group issues: create the epic first, then pass its key as `epic` on the
   children. Epics cannot have blocking links — link the child issues.
5. **Close it**: `close_issue` with a closing comment (what was done, where to
   find it). The response includes `unblocked` — issues your close freed up.
   Check it, then loop back to step 1 (`ready_work` again).

## Conventions

- **Never leave an issue `in_progress` silently.** If you stop working on it,
  either close it, or comment why and set it back to `open` (or `blocked`).
- Use `status: "blocked"` **only for external blockers** (waiting on a human, a
  credential, an outage) and always with a comment saying what you're waiting on.
  Blocking by another issue is derived from `blocks` links automatically — never
  set the status for that.
- Prefer `close_issue` over `update_issue status:done` — it reports what got
  unblocked.
- When cancelling (`status: "cancelled"`), comment why.
- Titles are one-line summaries; put context, acceptance criteria, and links in
  the description.
