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

- [ ] `src/auth/password.ts` — scrypt (node:crypto, works on Bun) hash/verify;
      admin password from settings table; bootstrap from `AGENTICKET_ADMIN_PASSWORD`
      env or CLI (phase 4) on first run
- [ ] `src/auth/sessions.ts` — create/validate/expire sessions (30d), cookie
      `agenticket_session`, HttpOnly, SameSite=Lax
- [ ] `src/auth/tokens.ts` — generate (`agt_` + 32B base64url), sha256 lookup,
      revoke, last_used_at touch (throttled)
- [ ] Auth middleware: accepts EITHER valid session cookie (actor = human/admin) OR
      `Authorization: Bearer agt_...` (actor = agent w/ token name); attaches Actor
      to context; 401 envelope otherwise
- [ ] Error envelope: `{error: {code, message}}`; zod-validated request bodies
      (zod schemas shared with MCP in phase 3 — put them in `src/domain/schemas.ts`)
- [ ] Routes as listed, calling domain functions only
- [ ] Integration tests via `app.request()` covering auth paths, CRUD happy paths,
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

_(fill in when phase completes)_
