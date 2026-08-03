import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { ZodError, z } from "zod";
import { verifyAdminPassword } from "../auth/password.js";
import { createSession, deleteSession, SESSION_COOKIE } from "../auth/sessions.js";
import { createToken, listTokens, revokeToken } from "../auth/tokens.js";
import type { Db } from "../db/connect.js";
import {
  addComment,
  type Comment,
  closeIssue,
  commentCreateSchema,
  createIssue,
  createLabel,
  createProject,
  DomainError,
  deleteIssue,
  deleteProject,
  getIssue,
  getProject,
  type IssueDetail,
  issueCreateSchema,
  issuePatchSchema,
  labelCreateSchema,
  linkIssues,
  linkSchema,
  listIssues,
  listLabels,
  listProjects,
  loginSchema,
  type Project,
  projectCreateSchema,
  projectPatchSchema,
  readyWork,
  requireStatus,
  tokenCreateSchema,
  unlinkIssues,
  updateIssue,
  updateProject,
} from "../domain/index.js";
import { type ApiEnv, authMiddleware, requireAdmin, unauthorized } from "./middleware.js";

/** External projections: internal ids and counters never leave the API. */
function serializeProject(p: Project) {
  return {
    key: p.key,
    name: p.name,
    description: p.description,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function serializeComment(c: Comment) {
  return {
    id: c.id,
    body: c.body,
    authorType: c.authorType,
    authorName: c.authorName,
    createdAt: c.createdAt,
  };
}

function serializeIssue(issue: IssueDetail) {
  return { ...issue, comments: issue.comments.map(serializeComment) };
}

async function parseBody<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new DomainError("validation", "request body must be valid JSON");
  }
  return schema.parse(raw);
}

function csv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

function intParam(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new DomainError("validation", `${name} must be a non-negative integer`);
  }
  return n;
}

export function createApi(db: Db): Hono<ApiEnv> {
  const api = new Hono<ApiEnv>();

  api.onError((err, c) => {
    if (err instanceof DomainError) {
      const status = err.code === "not_found" ? 404 : err.code === "conflict" ? 409 : 400;
      return c.json({ error: { code: err.code, message: err.message } }, status);
    }
    if (err instanceof ZodError) {
      return c.json({ error: { code: "validation", message: z.prettifyError(err) } }, 400);
    }
    console.error(err);
    return c.json({ error: { code: "internal", message: "internal server error" } }, 500);
  });

  // --- public routes (registered before the auth middleware) ---

  api.post("/auth/login", async (c) => {
    const { password } = await parseBody(c, loginSchema);
    if (!verifyAdminPassword(db, password)) {
      return unauthorized(c, "invalid password");
    }
    const session = createSession(db);
    setCookie(c, SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      expires: new Date(session.expiresAt),
    });
    return c.json({ ok: true, expiresAt: session.expiresAt });
  });

  api.post("/auth/logout", (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (sessionId) deleteSession(db, sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  api.use("*", authMiddleware(db));

  // --- projects ---

  api.get("/projects", (c) => c.json(listProjects(db).map(serializeProject)));

  api.post("/projects", async (c) => {
    const input = await parseBody(c, projectCreateSchema);
    return c.json(serializeProject(createProject(db, c.get("actor"), input)), 201);
  });

  api.get("/projects/:key", (c) => c.json(serializeProject(getProject(db, c.req.param("key")))));

  api.patch("/projects/:key", async (c) => {
    const patch = await parseBody(c, projectPatchSchema);
    return c.json(serializeProject(updateProject(db, c.get("actor"), c.req.param("key"), patch)));
  });

  api.delete("/projects/:key", requireAdmin, (c) => {
    deleteProject(db, c.get("actor"), c.req.param("key"));
    return c.json({ ok: true });
  });

  // --- labels ---

  api.get("/projects/:key/labels", (c) => {
    const project = getProject(db, c.req.param("key"));
    return c.json(listLabels(db, project.id).map((l) => ({ name: l.name, color: l.color })));
  });

  api.post("/projects/:key/labels", async (c) => {
    const project = getProject(db, c.req.param("key"));
    const input = await parseBody(c, labelCreateSchema);
    const label = createLabel(db, project.id, input.name, input.color);
    return c.json({ name: label.name, color: label.color }, 201);
  });

  // --- issues ---

  api.get("/issues", (c) => {
    const q = c.req.query();
    return c.json(
      listIssues(db, {
        project: q.project,
        status: csv(q.status),
        kind: q.kind === "epic" || q.kind === "issue" ? q.kind : undefined,
        epic: q.epic,
        assignee: q.assignee,
        labels: csv(q.label),
        text: q.q,
        limit: intParam(q.limit, "limit"),
        offset: intParam(q.offset, "offset"),
      }),
    );
  });

  api.post("/issues", async (c) => {
    const input = await parseBody(c, issueCreateSchema);
    return c.json(serializeIssue(createIssue(db, c.get("actor"), input)), 201);
  });

  api.get("/issues/:key", (c) => c.json(serializeIssue(getIssue(db, c.req.param("key")))));

  api.patch("/issues/:key", async (c) => {
    const key = c.req.param("key");
    const actor = c.get("actor");
    const patch = await parseBody(c, issuePatchSchema);
    // Closing goes through closeIssue so the response reports newly-unblocked issues.
    if (patch.status !== undefined && requireStatus(db, patch.status).category === "done") {
      const { status, ...rest } = patch;
      if (Object.keys(rest).length > 0) updateIssue(db, actor, key, rest);
      const result = closeIssue(db, actor, key, status as "done" | "cancelled");
      return c.json({ ...serializeIssue(result.issue), unblocked: result.unblocked });
    }
    return c.json(serializeIssue(updateIssue(db, actor, key, patch)));
  });

  api.delete("/issues/:key", requireAdmin, (c) => {
    deleteIssue(db, c.get("actor"), c.req.param("key"));
    return c.json({ ok: true });
  });

  // --- comments ---

  api.get("/issues/:key/comments", (c) =>
    c.json(getIssue(db, c.req.param("key")).comments.map(serializeComment)),
  );

  api.post("/issues/:key/comments", async (c) => {
    const { body } = await parseBody(c, commentCreateSchema);
    const comment = addComment(db, c.get("actor"), c.req.param("key"), body);
    return c.json(serializeComment(comment), 201);
  });

  // --- links ---

  api.post("/issues/:key/links", async (c) => {
    const { to, type } = await parseBody(c, linkSchema);
    return c.json(linkIssues(db, c.get("actor"), c.req.param("key"), to, type), 201);
  });

  api.delete("/issues/:key/links", async (c) => {
    const { to, type } = await parseBody(c, linkSchema);
    unlinkIssues(db, c.get("actor"), c.req.param("key"), to, type);
    return c.json({ ok: true });
  });

  // --- ready work ---

  api.get("/ready", (c) => {
    const q = c.req.query();
    return c.json(
      readyWork(db, {
        project: q.project,
        assignee: q.assignee,
        limit: intParam(q.limit, "limit"),
      }),
    );
  });

  // --- tokens (admin session only) ---

  api.get("/tokens", requireAdmin, (c) => c.json(listTokens(db)));

  api.post("/tokens", requireAdmin, async (c) => {
    const { name } = await parseBody(c, tokenCreateSchema);
    return c.json(createToken(db, name), 201);
  });

  api.delete("/tokens/:id", requireAdmin, (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      throw new DomainError("validation", "token id must be an integer");
    }
    revokeToken(db, id);
    return c.json({ ok: true });
  });

  return api;
}
