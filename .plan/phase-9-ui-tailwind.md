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

- [x] Design pass + user sign-off on direction — **light + dark via
      `prefers-color-scheme`, amber accent, standard/simple**
- [x] Tailwind 4 build wiring (`app.css`, `scripts/embed-css.mjs` →
      `src/web/app.css.gen.ts`, `npm run css:generate`)
- [x] Rework `src/web/ui.tsx` layout/components with Tailwind classes
- [x] Rework each page in `src/web/routes.tsx` (login, projects, issue list +
      epic tree, issue detail, ready queue, tokens)
- [x] Keep progressive-enhancement JS working (`/` filter, ctrl+enter)
- [x] Delete dead hand-rolled CSS from `src/web/assets.ts`
- [x] Update `.plan/PLAN.md` decision log (UI direction change supersedes the
      phase-6 terminal-flavor decision)

## Out of scope

- New features/pages, client-side framework, JS build tooling
- Auth changes

## Verification checklist

- [x] `npm test` (72), typecheck, lint, build green
- [x] Tests pass WITHOUT running Tailwind — `app.css.gen.ts` is committed and
      the suite only imports the generated string
- [x] Live walkthrough on Node (curl with session cookie: all 5 pages 200 with
      new markup; badges, ⚡agent attribution, agent-comment accent border,
      epic tint + tree + progress, derived blocked flag all present); Bun
      smoke green (:3601)
- [x] Works with JS disabled — forms + noscript submit buttons preserved
- [ ] User reviews the new UI live and signs off ← **pending, stop point**

## Handoff

- Stack: Tailwind 4 (`tailwindcss` + `@tailwindcss/cli` devDeps only).
  `src/web/app.css` is the source (`@theme` fonts + `@layer components` for
  `.btn/.input/.notice/.st-*/.pri-*/.agent/.human`); everything else is inline
  utilities in `ui.tsx`/`routes.tsx`. `npm run css:generate` compiles+embeds;
  the ~28 kB generated `src/web/app.css.gen.ts` is committed (build stays
  `tsdown`, Docker/CI unchanged — they never run Tailwind).
- Actor prefixes (⚡/@) moved from CSS `::before` into JSX so they exist in
  the HTML text (better a11y/copy-paste); web.test.ts human-attribution
  assertion loosened accordingly.
- Enhancement JS filter-focus selector changed `.filterline input` →
  `input[name=f]`.
- Demo instance for review: `scratchpad/ui-demo`, port 3600, password
  `demo-pass-123` (throwaway).
