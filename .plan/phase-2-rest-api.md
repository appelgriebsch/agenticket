# Phase 2 — REST API + Auth

## Goal

Full JSON REST API under `/api/v1` as a thin adapter over the domain layer, with human
session auth (admin password) and agent bearer-token auth.

## Endpoints

```
POST   /api/v1/auth/login              {password} → sets session cookie
POST   /api/v1/auth/logout
GET    /api/v1/projects | POST
GET    /api/v1/projects/:key | PATCH | DELETE
GET    /api/v1/projects/:key/labels | POST
GET    /api/v1/issues?project=&status=&kind=&epic=&assignee=&label=&q=&limit=&offset=
POST   /api/v1/issues
GET    /api/v1/issues/:key | PATCH | DELETE        (DELETE = human/admin only)
GET    /api/v1/issues/:key/comments | POST
POST   /api/v1/issues/:key/links | DELETE          (body {to, type})
GET    /api/v1/ready?project=&assignee=
GET    /api/v1/tokens | POST | DELETE /api/v1/tokens/:id   (admin session only)
GET    /healthz                                     (no auth)
```

## Tasks

- [x] `src/auth/password.ts` — scrypt (node:crypto, works on Bun) hash/verify;
      admin password from settings table; bootstrap from `AGENTICKET_ADMIN_PASSWORD`
      env or CLI (phase 4) on first run
- [x] `src/auth/sessions.ts` — create/validate/expire sessions (30d), cookie
      `agenticket_session`, HttpOnly, SameSite=Lax
- [x] `src/auth/tokens.ts` — generate (`agt_` + 32B base64url), sha256 lookup,
      revoke, last_used_at touch (throttled)
- [x] Auth middleware: accepts EITHER valid session cookie (actor = human/admin) OR
      `Authorization: Bearer agt_...` (actor = agent w/ token name); attaches Actor
      to context; 401 envelope otherwise
- [x] Error envelope: `{error: {code, message}}`; zod-validated request bodies
      (zod schemas shared with MCP in phase 3 — put them in `src/domain/schemas.ts`)
- [x] Routes as listed, calling domain functions only
- [x] Integration tests via `app.request()` covering auth paths, CRUD happy paths,
      validation errors, link cycle rejection through the API

## Out of scope

MCP endpoint, web UI pages, CLI token management (API exists; CLI wires up in phase 4).

## Verification checklist

```sh
npm test           # API integration suite green
npm run typecheck && npm run lint
# manual: start server, login with password, curl a project+issue through the API
```

## Handoff notes

**Completed 2026-08-03.** 36 tests green (21 new API integration tests);
typecheck/lint/build clean. Manual curl smoke passed on BOTH runtimes
(Node via tsx, Bun): login → token create → project → issue → get → ready.

Layout:
- `src/domain/schemas.ts` — zod schemas for every mutation body (strict objects:
  unknown keys rejected). Re-exported from `src/domain/index.ts`; phase 3 MCP
  tools should consume these directly.
- `src/auth/{password,sessions,tokens}.ts` — scrypt admin password (settings key
  `admin_password_hash`; `bootstrapAdminPassword` reads `AGENTICKET_ADMIN_PASSWORD`
  on first run), 30d sessions (cookie `agenticket_session`), bearer tokens
  (sha256 stored; `authenticateToken` touches last_used_at at most 1×/min).
- `src/api/middleware.ts` — `authMiddleware(db)` sets `c.get("actor")` (`ApiEnv`
  Hono env type); `requireAdmin` guards token routes + project/issue DELETE.
- `src/api/routes.ts` — `createApi(db)` mounted at `/api/v1` by `createApp`
  (`src/server.ts`, which now requires `{version, db}`). `onError` maps
  DomainError not_found/validation/conflict → 404/400/409, ZodError → 400,
  else 500; envelope `{error:{code,message}}`. 401 `unauthorized` / 403 `forbidden`.
- `src/config.ts` — data dir resolution (env-paths, `AGENTICKET_DATA_DIR`
  override); CLI `start` now opens the db, migrates, bootstraps the admin
  password, and installs SIGINT/SIGTERM shutdown. Added `--db <path>` option.

API behaviors phase 3+ should know:
- Serializers strip internal ids: projects expose no `id`/`nextIssueNumber`;
  comments expose `{id, body, authorType, authorName, createdAt}`. Issues are
  domain `IssueDetail`/`IssueSummary` verbatim (already key-based).
- PATCH `/issues/:key` with a done-category status routes through `closeIssue`
  and the response gains an `unblocked: string[]` field.
- Links: POST/DELETE `/issues/:key/links` take body `{to, type}`; `blocked_by`
  accepted and stored inverted (response shows the stored direction).
- List filters: `status` and `label` accept comma-separated values; `q` is text
  search; `kind`, `epic`, `assignee`, `limit`, `offset` as expected.
- DELETE `/tokens/:id` revokes (sets revoked_at) rather than deleting, so audit
  references survive. Token plaintext is returned exactly once from POST.
