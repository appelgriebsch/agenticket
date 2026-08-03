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

- [x] Design pass: static mock of issue-list + issue-detail; v1 (strict TUI) rejected
      by user — v2 signed off: full-width, 16px base, sans body + mono for data,
      dark + amber accent, "terminal as flavor, not constraint"
- [x] Layout component + CSS (single stylesheet served from memory at /assets/app.css)
- [x] Pages above, forms posting to thin form-handler routes (303 redirects)
- [x] Inline interactions: plain forms + ~20-line enhancement script (auto-submit
      selects, `/` focuses filter, ctrl+enter posts comment); works with JS disabled
- [x] HTML smoke tests via `app.request()` — tests/web.test.ts (14 tests)

## Out of scope

Realtime updates (polling refresh is fine v1), charts, mobile polish.

## Verification checklist

- [x] All pages render authenticated; login/logout works (redirect to /login when
      unauthenticated; 401 + error notice on wrong password)
- [x] Walkthrough: login → create project → agent-created issues visible (epic tree,
      derived blocked flag, agent attribution) → change status → comment → revoke
      token (revoked token then 401s on the API) — all via curl against a live
      server on Node; login/page/CSS smoke repeated under Bun
- [x] `npm test` green: 62 tests (14 new web tests); typecheck, lint, build green

## Handoff notes

- `src/web/`: `assets.ts` (APP_CSS + APP_JS strings, served from memory — same
  "nothing to resolve at runtime" reasoning as embedded migrations), `ui.tsx`
  (Layout + shared components), `routes.tsx` (`createWeb(db, version)`), mounted
  last in `createApp` so it owns `/` and everything not claimed by
  /healthz, /api/v1, /mcp.
- Auth: web pages use the same session cookie as the API but redirect to /login
  instead of 401. Login page hints at `agenticket admin set-password` when no
  password is set. CSRF relies on SameSite=Lax cookies.
- Filter input is command-line style (`status:a,b kind: epic: assignee: label:` +
  free text), parsed by `parseFilterLine` (exported, unit-tested).
- Issue list groups filtered children under filtered epics (tree connectors);
  epic progress ("n of m done") is computed over ALL children. Blocked flags come
  from the derived `blockedBy`, never a stored flag.
- Token create renders the plaintext directly into the response (no redirect) so
  the secret never appears in a URL. Revoke is a POST form.
- Domain change: `IssueSummary` now exposes `assigneeType` (was previously
  dropped in the projection) — REST responses gained the field too.
- Design mock artifact (v2, signed off): claude.ai/code/artifact/ce00e53e-6210-43ac-a6aa-d63e0415a321
