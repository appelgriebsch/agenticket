# agenticket

Agent-first issue tracker (TypeScript, Hono + Drizzle + SQLite/WAL, built-in MCP).

## Development process — READ THIS FIRST

This project is built phase-by-phase. **Before doing any work, read `.plan/PLAN.md`** —
it holds the current phase pointer, decision log, standing rules, and handoff notes.
Then read the current phase's `.plan/phase-N-*.md` for the detailed task list and
verification checklist.

Rules:
- Work strictly one phase at a time; a phase is done only when every item in its
  verification checklist passes.
- **Stop at the end of each phase** for user review before starting the next.
- Update `.plan/PLAN.md` (progress log, decisions, handoff notes) and the phase file
  (checkboxes, handoff section) at the end of every phase, so a fresh session can
  pick up with no other context.
- Commit at phase boundaries.

## Quick commands

- `npm test` / `npm run typecheck` / `npm run lint` / `npm run build`
- `npm run db:generate` — after editing `src/db/schema.ts` (regenerates SQL AND
  `src/db/migrations.gen.ts`; commit both)
- Smoke db on both runtimes: `npx tsx scripts/smoke-db.mjs` and `bun scripts/smoke-db.mjs`

## Non-negotiable constraints

- Must run under BOTH Node >=20 and Bun. Never statically import `better-sqlite3`
  or `bun:sqlite` — only the dynamic imports inside `src/db/connect.ts`.
- All mutations go through `src/domain/` with an `Actor`; REST/MCP are thin adapters.
- External surfaces use issue keys (`AGT-42`), never internal ids.
