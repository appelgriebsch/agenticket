# Phase 9 — Web UI refresh: standard, simple, Tailwind 4

## Goal

Replace the hand-rolled terminal-flavored CSS with a clean, standard-looking,
simple UI built on Tailwind CSS 4, keeping the existing SSR architecture
(Hono JSX, forms-first, assets embedded as strings — no static folder at
runtime).

## Design pass (start of phase, with user)

- Direction: "standard UI, simple" — user explicitly moved away from the
  terminal aesthetic. Confirm: light vs dark (or both via `prefers-color-scheme`),
  accent color, density.
- Keep: full-width layouts, ≥16px base, generous spacing, mono for keys/data,
  agent vs human attribution treatment.

## Build integration (the key constraint)

Runtime must stay dependency-free and static-folder-free on BOTH Node and Bun:

- Tailwind 4 runs at **build time only** (`@tailwindcss/cli` as a devDependency):
  scan `src/web/**/*.tsx` + a `src/web/app.css` source, output compiled CSS.
- A build script embeds the compiled CSS into `src/web/assets.gen.ts` (same
  pattern as `migrations.gen.ts`) — committed, so `tsx`/dev and test runs never
  need Tailwind installed.
- `npm run build` (and a `css:generate` script) regenerate; CI check that the
  committed output is current (like drizzle check) — or regenerate in prepack.

## Tasks

- [ ] Design pass + user sign-off on direction
- [ ] Tailwind 4 build wiring (`app.css`, cli script, embed step, npm scripts)
- [ ] Rework `src/web/ui.tsx` layout/components with Tailwind classes
- [ ] Rework each page in `src/web/routes.tsx` (login, projects, issue list +
      epic tree, issue detail, ready queue, tokens)
- [ ] Keep progressive-enhancement JS working (`/` filter, ctrl+enter)
- [ ] Delete dead hand-rolled CSS from `src/web/assets.ts`
- [ ] Update `.plan/PLAN.md` decision log (UI direction change supersedes the
      phase-6 terminal-flavor decision)

## Out of scope

- New features/pages, client-side framework, JS build tooling
- Auth changes

## Verification checklist

- [ ] `npm test` (web tests updated), typecheck, lint, build green
- [ ] Fresh checkout + `npm ci` + tests pass WITHOUT running Tailwind (generated
      CSS is committed)
- [ ] Live walkthrough of every page on Node; smoke on Bun
- [ ] Works with JS disabled (forms-first preserved)
- [ ] User reviews the new UI live and signs off

## Handoff

(fill at phase end)
