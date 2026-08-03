# Phase 6 — Web UI (terminal aesthetic)

## Goal

Nerdy, terminal-styled server-rendered UI for humans: observe agents' work, manage
issues/tokens. **Start this phase with a design pass** (user wants design-first here):
propose the visual language (type, colors, layout density) before building pages.

## Design principles

- Hono JSX SSR (`jsxImportSource: hono/jsx` already configured), no SPA framework.
- Terminal aesthetic: monospace font, dark background, top-left anchored layout,
  dense tables, keyboard-friendly. Looks like a TUI rendered in the browser.
- Minimal client JS: htmx (vendored, ~14kB) or ~50 lines of vanilla fetch-swap for
  inline status changes, comment posting, filters. No build step for the client.
- All pages behind session auth (login page excepted); reuse REST/domain layer.

## Pages

- `/login` — password prompt
- `/` — project list + instance stats (issue counts by status category)
- `/p/:key` — issue list: filterable (status, kind, epic, assignee, label, text),
  epics expandable to their children, blocked indicators (derived blocked_by)
- `/i/:key` — issue detail: description, status/priority/assignee controls, labels,
  links graph (textual: blocks/blocked-by/depends-on lists), comments timeline with
  agent attribution (token name), activity
- `/tokens` — token admin: list w/ last_used_at, create (show once), revoke
- `/ready?project=` — the ready-work queue as agents see it

## Tasks

- [ ] Design pass: static mock of issue-list + issue-detail in the terminal style;
      get user sign-off before wiring
- [ ] Layout component + CSS (single static stylesheet, no framework)
- [ ] Pages above, forms posting to REST endpoints (or thin form-handler routes)
- [ ] Inline interactions (status select, comment box) via fetch-swap
- [ ] HTML smoke tests via `app.request()` (status codes + key markers in markup)

## Out of scope

Realtime updates (polling refresh is fine v1), charts, mobile polish.

## Verification checklist

- All pages render authenticated; login/logout works
- Walkthrough: login → create project → see agent-created issues → change status →
  comment → revoke token — all from UI
- `npm test` green including HTML smoke tests

## Handoff notes

_(fill in when phase completes)_
