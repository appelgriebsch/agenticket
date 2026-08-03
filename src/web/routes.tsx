import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Child } from "hono/jsx";
import { hasAdminPassword, verifyAdminPassword } from "../auth/password.js";
import { createSession, deleteSession, SESSION_COOKIE, validateSession } from "../auth/sessions.js";
import { createToken, listTokens, revokeToken } from "../auth/tokens.js";
import type { Db } from "../db/connect.js";
import {
  type Actor,
  addComment,
  createProject,
  DomainError,
  getIssue,
  getProject,
  getStatusCatalog,
  type IssueSummary,
  type ListIssuesFilter,
  listIssues,
  listProjects,
  readyWork,
  updateIssue,
} from "../domain/index.js";
import { APP_CSS, APP_JS } from "./assets.js";
import {
  ActorName,
  absTime,
  BlockedFlag,
  IssueRow,
  IssueTableHead,
  Labels,
  Layout,
  LoginLayout,
  PriorityTag,
  StatusBadge,
  timeAgo,
} from "./ui.js";

type WebEnv = { Variables: { actor: Actor } };

/**
 * Parse the command-line style filter input into a ListIssuesFilter.
 * Tokens: status:a,b kind:issue|epic epic:KEY assignee:name label:x,y; the rest
 * is free-text matched against title/description.
 */
export function parseFilterLine(line: string): Omit<ListIssuesFilter, "project"> {
  const filter: Omit<ListIssuesFilter, "project"> = {};
  const text: string[] = [];
  for (const token of line.trim().split(/\s+/).filter(Boolean)) {
    const m = token.match(/^(status|kind|epic|assignee|label):(.*)$/);
    if (!m?.[2]) {
      text.push(token);
      continue;
    }
    const value = m[2];
    switch (m[1]) {
      case "status":
        filter.status = value.split(",").filter(Boolean);
        break;
      case "kind":
        if (value === "epic" || value === "issue") filter.kind = value;
        break;
      case "epic":
        filter.epic = value;
        break;
      case "assignee":
        filter.assignee = value;
        break;
      case "label":
        filter.labels = value.split(",").filter(Boolean);
        break;
    }
  }
  if (text.length) filter.text = text.join(" ");
  return filter;
}

function formString(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  return typeof value === "string" ? value.trim() : "";
}

export function createWeb(db: Db, version: string): Hono<WebEnv> {
  const web = new Hono<WebEnv>();

  web.onError((err, c) => {
    if (err instanceof DomainError) {
      const status = err.code === "not_found" ? 404 : err.code === "conflict" ? 409 : 400;
      return c.html(
        <Layout title="error" version={version}>
          <div class="notice error">{err.message}</div>
        </Layout>,
        status,
      );
    }
    console.error(err);
    return c.html(
      <Layout title="error" version={version}>
        <div class="notice error">internal server error</div>
      </Layout>,
      500,
    );
  });

  // --- static assets + login (public, registered before the auth middleware) ---

  web.get("/assets/app.css", (c) => c.text(APP_CSS, 200, { "content-type": "text/css" }));
  web.get("/assets/app.js", (c) => c.text(APP_JS, 200, { "content-type": "text/javascript" }));

  const LoginPage = (props: { error?: string; passwordMissing: boolean }) => (
    <LoginLayout>
      <form class="loginbox" method="post" action="/login">
        <h1>
          <span class="agent" /> agenticket
        </h1>
        {props.error ? <div class="notice error">{props.error}</div> : null}
        {props.passwordMissing ? (
          <p class="hint">
            No admin password is set. Run <code class="mono">agenticket admin set-password</code>{" "}
            first, then log in here.
          </p>
        ) : null}
        <input
          class="ctl"
          type="password"
          name="password"
          placeholder="admin password"
          aria-label="admin password"
          autofocus
        />
        <button class="ctl primary" type="submit">
          Log in
        </button>
      </form>
    </LoginLayout>
  );

  web.get("/login", (c) => c.html(<LoginPage passwordMissing={!hasAdminPassword(db)} />));

  web.post("/login", async (c) => {
    const body = await c.req.parseBody();
    const password = formString(body, "password");
    if (!verifyAdminPassword(db, password)) {
      return c.html(
        <LoginPage error="Invalid password." passwordMissing={!hasAdminPassword(db)} />,
        401,
      );
    }
    const session = createSession(db);
    setCookie(c, SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      expires: new Date(session.expiresAt),
    });
    return c.redirect("/", 303);
  });

  web.post("/logout", (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (sessionId) deleteSession(db, sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.redirect("/login", 303);
  });

  // --- session auth for everything below; browsers get a redirect, not a 401 ---

  const requireSession: MiddlewareHandler<WebEnv> = async (c, next) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId || !validateSession(db, sessionId)) {
      return c.redirect("/login", 303);
    }
    c.set("actor", { type: "human", name: "admin" });
    return next();
  };
  web.use("*", requireSession);

  // --- home: project list + create form ---

  web.get("/", (c) => {
    const projects = listProjects(db);
    const catalog = getStatusCatalog(db);
    const error = c.req.query("error");
    return c.html(
      <Layout title="projects" active="projects" version={version}>
        <div class="pagehead">
          <h1>Projects</h1>
          <span class="sub">
            {projects.length === 1 ? "1 project" : `${projects.length} projects`}
          </span>
        </div>
        {error ? <div class="notice error">{error}</div> : null}
        {projects.length === 0 ? (
          <p class="empty">No projects yet — create one below, or let an agent do it over MCP.</p>
        ) : (
          <div class="cards">
            {projects.map((p) => {
              const issues = listIssues(db, { project: p.key, limit: 1000 });
              const counts = { todo: 0, active: 0, done: 0 };
              for (const i of issues) {
                if (i.kind !== "issue") continue;
                const cat = catalog.get(i.status)?.category ?? "todo";
                counts[cat] += 1;
              }
              return (
                <div class="card">
                  <h2>
                    <a href={`/p/${p.key}`}>
                      <span class="key mono">{p.key}</span> {p.name}
                    </a>
                  </h2>
                  {p.description ? (
                    <p style="margin:0" class="sub">
                      {p.description}
                    </p>
                  ) : null}
                  <div class="counts">
                    <span class="todo">
                      <b>{counts.todo}</b> todo
                    </span>
                    <span class="active">
                      <b>{counts.active}</b> active
                    </span>
                    <span class="done">
                      <b>{counts.done}</b> done
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <form class="inlineform" method="post" action="/projects">
          <input class="ctl mono" name="key" placeholder="KEY" size={6} maxlength={10} required />
          <input class="ctl" name="name" placeholder="Project name" size={28} required />
          <button class="ctl primary" type="submit">
            Create project
          </button>
        </form>
      </Layout>,
    );
  });

  web.post("/projects", async (c) => {
    const body = await c.req.parseBody();
    try {
      const project = createProject(db, c.get("actor"), {
        key: formString(body, "key"),
        name: formString(body, "name"),
      });
      return c.redirect(`/p/${project.key}`, 303);
    } catch (err) {
      if (err instanceof DomainError) {
        return c.redirect(`/?error=${encodeURIComponent(err.message)}`, 303);
      }
      throw err;
    }
  });

  // --- issue list ---

  web.get("/p/:key", (c) => {
    const project = getProject(db, c.req.param("key"));
    const filterLine = c.req.query("f") ?? "";
    const filter = parseFilterLine(filterLine);
    const filtered = listIssues(db, { ...filter, project: project.key, limit: 500 });
    const all = listIssues(db, { project: project.key, limit: 1000 });
    const catalog = getStatusCatalog(db);

    // Epic progress over ALL children, not just the filtered ones.
    const progress = new Map<string, { done: number; total: number }>();
    for (const i of all) {
      if (i.kind !== "issue" || !i.epic) continue;
      const p = progress.get(i.epic) ?? { done: 0, total: 0 };
      p.total += 1;
      if (catalog.get(i.status)?.category === "done") p.done += 1;
      progress.set(i.epic, p);
    }

    // Group filtered children under filtered epics; everything else renders flat.
    const epicKeys = new Set(filtered.filter((i) => i.kind === "epic").map((i) => i.key));
    const childrenOf = new Map<string, IssueSummary[]>();
    for (const i of filtered) {
      if (i.kind === "issue" && i.epic && epicKeys.has(i.epic)) {
        const list = childrenOf.get(i.epic) ?? [];
        list.push(i);
        childrenOf.set(i.epic, list);
      }
    }

    const rows: Child[] = [];
    for (const issue of filtered) {
      if (issue.kind === "epic") {
        const p = progress.get(issue.key);
        rows.push(
          <IssueRow
            issue={issue}
            extra={
              p ? (
                <span class="progress">
                  {" "}
                  {p.done} of {p.total} done
                </span>
              ) : null
            }
          />,
        );
        const children = childrenOf.get(issue.key) ?? [];
        children.forEach((child, idx) => {
          rows.push(<IssueRow issue={child} tree={idx === children.length - 1 ? "last" : "mid"} />);
        });
      } else if (!(issue.epic && epicKeys.has(issue.epic))) {
        rows.push(<IssueRow issue={issue} />);
      }
    }

    const blockedCount = all.filter((i) => i.blockedBy.length > 0).length;
    return c.html(
      <Layout
        title={project.key}
        active="projects"
        version={version}
        crumb={
          <>
            / <b>{project.key}</b>
          </>
        }
      >
        <div class="pagehead">
          <h1>{project.name}</h1>
          <span class="sub">
            {all.length} issues · {blockedCount} blocked
          </span>
        </div>
        <form method="get" action={`/p/${project.key}`}>
          <div class="filterline mono">
            <span class="gt">&gt;</span>
            <input
              name="f"
              value={filterLine}
              placeholder="status:open,in_progress label:mcp free text…"
              spellcheck={false}
              aria-label="filter"
            />
            <span class="hint">status: kind: epic: assignee: label: + free text</span>
          </div>
        </form>
        {filtered.length === 0 ? (
          <p class="empty">No issues match.</p>
        ) : (
          <div class="tablewrap">
            <table class="issues">
              <IssueTableHead />
              <tbody>{rows}</tbody>
            </table>
          </div>
        )}
      </Layout>,
    );
  });

  // --- issue detail ---

  web.get("/i/:key", (c) => {
    const issue = getIssue(db, c.req.param("key"));
    const catalog = [...getStatusCatalog(db).values()].sort((a, b) => a.sortOrder - b.sortOrder);
    const epic = issue.epic ? getIssue(db, issue.epic) : null;
    const linkLabel = (type: string, direction: "out" | "in"): string => {
      if (type === "blocks") return direction === "out" ? "blocks" : "blocked by";
      if (type === "depends_on") return direction === "out" ? "depends on" : "needed by";
      if (type === "duplicates") return direction === "out" ? "duplicates" : "duplicated by";
      return "relates to";
    };
    return c.html(
      <Layout
        title={issue.key}
        active="projects"
        version={version}
        crumb={
          <>
            /{" "}
            <b>
              <a href={`/p/${issue.project}`}>{issue.project}</a>
            </b>{" "}
            / {issue.key}
          </>
        }
      >
        <div class="detailgrid">
          <main>
            <div class="issuehead">
              <span class="key mono">{issue.key}</span>
              <h1>{issue.title}</h1>
            </div>
            <div class="headmeta">
              <StatusBadge status={issue.status} />
              <PriorityTag priority={issue.priority} />
              <BlockedFlag blockedBy={issue.blockedBy} />
              {epic ? (
                <span class="crumb">
                  in epic{" "}
                  <a href={`/i/${epic.key}`}>
                    {epic.key} · {epic.title}
                  </a>
                </span>
              ) : null}
            </div>

            {issue.description ? (
              <section class="block">
                <h2>Description</h2>
                <pre class="desc">{issue.description}</pre>
              </section>
            ) : null}

            {issue.links.length > 0 ? (
              <section class="block">
                <h2>Links</h2>
                <ul class="links">
                  {issue.links.map((l) => (
                    <li>
                      <span class="ltype">{linkLabel(l.type, l.direction)}</span>
                      <a class="mono" href={`/i/${l.otherKey}`}>
                        {l.otherKey}
                      </a>
                      <StatusBadge status={l.otherStatus} />
                      <span>{l.otherTitle}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section class="block">
              <h2>Activity</h2>
              {issue.comments.length === 0 ? <p class="empty">No comments yet.</p> : null}
              {issue.comments.map((comment) => (
                <div class={comment.authorType === "agent" ? "comment by-agent" : "comment"}>
                  <div class="chead">
                    <ActorName type={comment.authorType} name={comment.authorName} />{" "}
                    <time title={absTime(comment.createdAt)}>
                      · {timeAgo(comment.createdAt)} ago
                    </time>
                  </div>
                  <p>{comment.body}</p>
                </div>
              ))}
              <form class="commentbox" method="post" action={`/i/${issue.key}/comment`}>
                <textarea
                  name="body"
                  placeholder="Write a comment…"
                  aria-label="comment"
                  required
                />
                <button class="ctl primary" type="submit">
                  Post comment
                </button>
              </form>
            </section>
          </main>

          <aside>
            <dl class="meta">
              <dt>Status</dt>
              <dd>
                <form method="post" action={`/i/${issue.key}/update`}>
                  <select class="ctl" name="status" aria-label="status" data-autosubmit>
                    {catalog.map((s) => (
                      <option value={s.name} selected={s.name === issue.status}>
                        {s.name}
                      </option>
                    ))}
                  </select>{" "}
                  <noscript>
                    <button class="ctl" type="submit">
                      set
                    </button>
                  </noscript>
                </form>
              </dd>
              <dt>Priority</dt>
              <dd>
                <form method="post" action={`/i/${issue.key}/update`}>
                  <select class="ctl" name="priority" aria-label="priority" data-autosubmit>
                    {[0, 1, 2, 3, 4].map((p) => (
                      <option value={String(p)} selected={p === issue.priority}>
                        P{p}
                      </option>
                    ))}
                  </select>{" "}
                  <noscript>
                    <button class="ctl" type="submit">
                      set
                    </button>
                  </noscript>
                </form>
              </dd>
              <dt>Assignee</dt>
              <dd>
                {issue.assignee ? (
                  <ActorName type={issue.assigneeType ?? "human"} name={issue.assignee} />
                ) : (
                  "—"
                )}
              </dd>
              <dt>Labels</dt>
              <dd>{issue.labels.length ? <Labels labels={issue.labels} /> : "—"}</dd>
              <dt>Created</dt>
              <dd class="key mono" title={absTime(issue.createdAt)}>
                {timeAgo(issue.createdAt)} ago
              </dd>
              <dt>Updated</dt>
              <dd class="key mono" title={absTime(issue.updatedAt)}>
                {timeAgo(issue.updatedAt)} ago
              </dd>
              {issue.closedAt ? (
                <>
                  <dt>Closed</dt>
                  <dd class="key mono" title={absTime(issue.closedAt)}>
                    {timeAgo(issue.closedAt)} ago
                  </dd>
                </>
              ) : null}
            </dl>
          </aside>
        </div>
      </Layout>,
    );
  });

  web.post("/i/:key/update", async (c) => {
    const key = c.req.param("key");
    const body = await c.req.parseBody();
    const patch: { status?: string; priority?: number } = {};
    const status = formString(body, "status");
    const priority = formString(body, "priority");
    if (status) patch.status = status;
    if (priority) patch.priority = Number(priority);
    updateIssue(db, c.get("actor"), key, patch);
    return c.redirect(`/i/${key.toUpperCase()}`, 303);
  });

  web.post("/i/:key/comment", async (c) => {
    const key = c.req.param("key");
    const body = await c.req.parseBody();
    addComment(db, c.get("actor"), key, formString(body, "body"));
    return c.redirect(`/i/${key.toUpperCase()}`, 303);
  });

  // --- ready queue ---

  web.get("/ready", (c) => {
    const projects = listProjects(db);
    const selected = c.req.query("project");
    const issues = readyWork(db, { project: selected || undefined, limit: 50 });
    return c.html(
      <Layout title="ready" active="ready" version={version}>
        <div class="pagehead">
          <h1>Ready work</h1>
          <span class="sub">unblocked open issues, as agents see them (priority, then oldest)</span>
        </div>
        <form method="get" action="/ready">
          <div class="filterline">
            <select class="ctl" name="project" aria-label="project" data-autosubmit>
              <option value="">all projects</option>
              {projects.map((p) => (
                <option value={p.key} selected={p.key === selected}>
                  {p.key} · {p.name}
                </option>
              ))}
            </select>
            <noscript>
              <button class="ctl" type="submit">
                filter
              </button>
            </noscript>
          </div>
        </form>
        {issues.length === 0 ? (
          <p class="empty">Nothing ready — everything is either done, blocked, or claimed.</p>
        ) : (
          <div class="tablewrap">
            <table class="issues">
              <IssueTableHead />
              <tbody>
                {issues.map((issue) => (
                  <IssueRow issue={issue} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Layout>,
    );
  });

  // --- token admin ---

  const TokensPage = (props: { created?: { name: string; token: string }; error?: string }) => {
    const tokens = listTokens(db);
    return (
      <Layout title="tokens" active="tokens" version={version}>
        <div class="pagehead">
          <h1>Agent tokens</h1>
          <span class="sub">bearer tokens for MCP and REST access</span>
        </div>
        {props.error ? <div class="notice error">{props.error}</div> : null}
        {props.created ? (
          <div class="notice">
            Token <b>{props.created.name}</b> created — copy it now, it is shown only once:
            <code class="token mono">{props.created.token}</code>
          </div>
        ) : null}
        {tokens.length === 0 ? (
          <p class="empty">No tokens yet.</p>
        ) : (
          <table class="plain">
            <thead>
              <tr>
                <th>name</th>
                <th>created</th>
                <th>last used</th>
                <th>status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr>
                  <td class={t.revokedAt ? "revoked" : undefined}>
                    <span class="agent">{t.name}</span>
                  </td>
                  <td class="key mono">{absTime(t.createdAt)}</td>
                  <td class="key mono">
                    {t.lastUsedAt ? `${timeAgo(t.lastUsedAt)} ago` : "never"}
                  </td>
                  <td>
                    {t.revokedAt ? (
                      <span class="st st-cancelled">revoked</span>
                    ) : (
                      <span class="st st-done">active</span>
                    )}
                  </td>
                  <td>
                    {t.revokedAt ? null : (
                      <form method="post" action={`/tokens/${t.id}/revoke`}>
                        <button class="ctl danger" type="submit">
                          revoke
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form class="inlineform" method="post" action="/tokens">
          <input
            class="ctl"
            name="name"
            placeholder="token name (e.g. scout-1)"
            size={28}
            required
          />
          <button class="ctl primary" type="submit">
            Create token
          </button>
        </form>
      </Layout>
    );
  };

  web.get("/tokens", (c) => c.html(<TokensPage />));

  web.post("/tokens", async (c) => {
    const body = await c.req.parseBody();
    try {
      const created = createToken(db, formString(body, "name"));
      // Rendered directly (no redirect): the plaintext must never travel in a URL.
      return c.html(<TokensPage created={{ name: created.name, token: created.token }} />, 201);
    } catch (err) {
      if (err instanceof DomainError) return c.html(<TokensPage error={err.message} />, 409);
      throw err;
    }
  });

  web.post("/tokens/:id/revoke", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) throw new DomainError("validation", "token id must be an integer");
    revokeToken(db, id);
    return c.redirect("/tokens", 303);
  });

  return web;
}
