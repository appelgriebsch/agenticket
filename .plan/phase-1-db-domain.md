# Phase 1 — Database + Domain Layer

## Goal

Complete Drizzle schema, dual-runtime SQLite connection with WAL, embedded migrations,
and a fully tested pure domain layer (`src/domain/`) that both REST (phase 2) and MCP
(phase 3) will call. No HTTP in this phase.

## Schema (src/db/schema.ts)

Conventions: integer autoincrement PK `id`; `created_at`/`updated_at` unix-ms integers
set in the domain layer; every FK indexed.

- `projects` — id, `key` TEXT UNIQUE (e.g. "AGT", uppercase, [A-Z][A-Z0-9]{1,9}), name,
  description, `next_issue_number` INTEGER DEFAULT 1, timestamps.
- `statuses` — id, `project_id` NULLABLE FK (NULL = global default set), name,
  `category` TEXT CHECK IN ('todo','active','done'), sort_order. UNIQUE(project_id, name).
  Seed global rows: open(todo), in_progress(active), blocked(active), in_review(active),
  done(done), cancelled(done). This is the future-proofing for per-project statuses.
- `issues` — id, project_id FK, `number` INT, `key` TEXT UNIQUE ("AGT-42", stored
  denormalized), `kind` CHECK('epic','issue'), `epic_id` NULLABLE FK→issues.id, title,
  description, `status` TEXT (validated in domain against statuses catalog),
  `priority` INT CHECK 0..4 DEFAULT 2 (0=urgent..4=none), assignee_type
  NULLABLE('agent','human'), assignee TEXT NULLABLE, created_by_token_id NULLABLE FK,
  created_at, updated_at, closed_at NULLABLE.
  UNIQUE(project_id, number); INDEX(project_id, status), INDEX(epic_id), INDEX(status).
- `issue_links` — id, source_id FK, target_id FK, `type` CHECK
  ('blocks','depends_on','relates_to','duplicates'), created_by_token_id NULLABLE,
  created_at. UNIQUE(source_id, target_id, type); INDEX both sides.
  `blocked_by` is never stored: "A blocked_by B" is written as "B blocks A".
- `labels` — id, project_id FK, name, color NULLABLE. UNIQUE(project_id, name).
- `issue_labels` — issue_id, label_id, PK(issue_id, label_id).
- `comments` — id, issue_id FK, body, author_type('agent','human'),
  author_token_id NULLABLE FK, `author_name` TEXT (denormalized so audit survives token
  deletion), created_at. INDEX(issue_id).
- `tokens` — id, name UNIQUE, `token_hash` UNIQUE (sha256 of plaintext), created_at,
  last_used_at NULLABLE, revoked_at NULLABLE. Plaintext format `agt_` + 32 bytes
  base64url, shown exactly once at creation.
- `sessions` — id TEXT PK (random), created_at, expires_at.
- `settings` — key TEXT PK, value TEXT (admin_password_hash etc.).

## Tasks

- [x] `src/db/schema.ts` full schema above
- [x] `src/db/connect.ts` — runtime switch: Bun → dynamic import `bun:sqlite` +
      `drizzle-orm/bun-sqlite`; Node → dynamic import `better-sqlite3` +
      `drizzle-orm/better-sqlite3`. Shared exported `Db` type
      (`BaseSQLiteDatabase<'sync', ...>` based). Pragmas on connect:
      `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`, `synchronous=NORMAL`.
- [x] `drizzle.config.ts` + `npm run db:generate` → `src/db/migrations/` committed
- [x] `src/db/migrate.ts` — startup migrator mirroring the runtime switch; migrations
      dir resolved via `new URL('./migrations', import.meta.url)`; tsdown must copy
      migrations into `dist/` (verify in build output!)
- [x] Status seeding (idempotent, part of migrate/boot)
- [x] `src/domain/actor.ts` — `Actor = {type:'agent'|'human', tokenId?:number, name:string}`
- [x] `src/domain/projects.ts` — create/get/list/update/delete; key validation
- [x] `src/domain/issues.ts` — create (atomic number allocation via
      `UPDATE projects SET next_issue_number = next_issue_number + 1 ... RETURNING`),
      get by key (with links, labels, computed blocked_by/blocks), update (partial),
      list with filters (project, status[], kind, epic, assignee, labels, text LIKE,
      limit/offset), close (returns newly-unblocked issue keys). Hierarchy rules:
      epics cannot have epic_id; epic_id target must be kind='epic' in same project.
- [x] `src/domain/links.ts` — link/unlink; normalize blocked_by; **cycle detection**
      for blocks/depends_on (recursive CTE or BFS) rejecting cycles; disallow
      self-links and epic participation in blocks/depends_on
- [x] `src/domain/ready.ts` — ready_work query: kind='issue', status category != 'done',
      status != 'blocked', no open blockers (blocker status category != 'done'),
      ordered by priority then created_at
- [x] `src/domain/labels.ts`, `src/domain/comments.ts`
- [x] Tests for all of the above on `:memory:` db (fresh migrate per suite)

## Out of scope

HTTP routes, MCP, sessions/auth logic (tables exist, logic in phases 2–3), CLI daemon.

## Verification checklist

```sh
npm test            # domain suite green, incl. cycle detection + ready_work + numbering race test
npm run typecheck && npm run lint && npm run build
node -e '...'       # smoke: fresh file db, migrate runs, WAL mode confirmed (PRAGMA journal_mode → wal)
bun -e '...'        # same under Bun (bun:sqlite path)
```

## Handoff notes

**Completed 2026-08-03.** 15 domain tests green; typecheck/lint/build clean; file-db
smoke (migrate ×2 idempotent, WAL confirmed, create+ready) passed under Node
(`npx tsx scripts/smoke-db.mjs`) and Bun (`bun scripts/smoke-db.mjs`).

Deviations from the original task text (both deliberate, recorded here):

1. **Migrations are embedded as code, not shipped as a folder.**
   `scripts/embed-migrations.mjs` converts drizzle-kit output into
   `src/db/migrations.gen.ts` (committed; regenerated by `npm run db:generate`).
   `src/db/migrate.ts` is a tiny runner tracking applied tags in a `_migrations`
   table. This removes the dist-folder-resolution risk under npx/bunx entirely —
   nothing to copy in tsdown, nothing resolved via import.meta.url at runtime.
   Schema changes = edit `src/db/schema.ts` → `npm run db:generate` → commit both
   the .sql and the regenerated .gen.ts.
2. **Status seeding checks existence instead of ON CONFLICT** — SQLite treats NULLs
   as distinct in unique indexes, so global rows (project_id IS NULL) never conflict.

Facts phase 2/3 need:
- `Db` type + `connect(path)` in `src/db/connect.ts` (returns `{db, close}`;
  close() checkpoints WAL). `migrate(db)` in `src/db/migrate.ts` (also seeds statuses).
- Everything is exported from `src/domain/index.ts`. All mutations take
  `(db, actor, ...)`; `Actor` in `src/domain/actor.ts`.
- `DomainError.code`: `not_found` | `validation` | `conflict` → map to HTTP
  404/400/409 in the API error envelope.
- Key surfaces: `createProject/getProject/listProjects/updateProject/deleteProject`,
  `createIssue/getIssue/updateIssue/listIssues/closeIssue/deleteIssue`,
  `linkIssues/unlinkIssues` (accepts `blocked_by` sugar), `readyWork`, `addComment`,
  `createLabel/listLabels`. `closeIssue` returns `{issue, unblocked: string[]}`.
- `getIssue` returns full detail (labels, links, comments, derived `blockedBy`);
  `listIssues`/`readyWork` return `IssueSummary` rows.
- Issue keys are uppercase-normalized on every lookup; internal ids never leave domain.
- bun:sqlite type declaration for tsc lives in `src/types/bun-sqlite.d.ts`.
- The cross-process WAL concurrency test is deferred to phase 3 (parallel MCP
  clients), as planned — in-process the sync driver serializes writes anyway.
