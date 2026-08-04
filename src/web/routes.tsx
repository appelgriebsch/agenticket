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
  KEY_TEXT,
  Labels,
  Layout,
  LoginLayout,
  Markdown,
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

const PageHead = (props: { title: string; sub?: Child }) => (
  <div class="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
    <h1 class="m-0 text-2xl font-semibold tracking-tight">{props.title}</h1>
    {props.sub ? <span class="text-sm text-muted-foreground">{props.sub}</span> : null}
  </div>
);

const SectionTitle = (props: { children?: Child }) => (
  <h2 class="mt-0 mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
    {props.children}
  </h2>
);

const EMPTY = "py-6 text-muted-foreground";
const INLINE_FORM = "card mt-6 flex flex-wrap items-center gap-2 p-3";

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
      <form
        class="card mx-auto mt-[18vh] grid w-full max-w-sm gap-4 p-6 shadow-sm"
        method="post"
        action="/login"
      >
        <div class="grid gap-1">
          <h1 class="m-0 text-xl font-semibold tracking-tight">agenticket</h1>
          <p class="m-0 text-sm text-muted-foreground">Enter the admin password to continue.</p>
        </div>
        {props.error ? <div class="notice error">{props.error}</div> : null}
        {props.passwordMissing ? (
          <p class="m-0 text-sm text-muted-foreground">
            No admin password is set. Run{" "}
            <code class="font-mono">agenticket admin set-password</code> first, then log in here.
          </p>
        ) : null}
        <input
          class="input w-full"
          type="password"
          name="password"
          placeholder="admin password"
          aria-label="admin password"
          autofocus
        />
        <button class="btn btn-primary justify-center" type="submit">
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
        <PageHead
          title="Projects"
          sub={projects.length === 1 ? "1 project" : `${projects.length} projects`}
        />
        {error ? <div class="notice error">{error}</div> : null}
        {projects.length === 0 ? (
          <p class={EMPTY}>No projects yet — create one below, or let an agent do it over MCP.</p>
        ) : (
          <div class="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-4">
            {projects.map((p) => {
              const issues = listIssues(db, { project: p.key, limit: 1000 });
              const counts = { todo: 0, active: 0, done: 0 };
              for (const i of issues) {
                if (i.kind !== "issue") continue;
                const cat = catalog.get(i.status)?.category ?? "todo";
                counts[cat] += 1;
              }
              return (
                <div class="card grid gap-2 p-5 transition-colors hover:bg-muted/40">
                  <h2 class="m-0 font-medium">
                    <a class="text-foreground hover:underline" href={`/p/${p.key}`}>
                      <span class={KEY_TEXT}>{p.key}</span> {p.name}
                    </a>
                  </h2>
                  {p.description ? (
                    <p class="m-0 text-sm text-muted-foreground">{p.description}</p>
                  ) : null}
                  <div class="mt-1 flex gap-5 text-sm text-muted-foreground">
                    <span>
                      <b class="font-semibold text-foreground">{counts.todo}</b> todo
                    </span>
                    <span>
                      <b class="font-semibold text-blue-600 dark:text-blue-400">{counts.active}</b>{" "}
                      active
                    </span>
                    <span>
                      <b class="font-semibold text-green-600 dark:text-green-400">{counts.done}</b>{" "}
                      done
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <form class={INLINE_FORM} method="post" action="/projects">
          <input
            class="input w-20 font-mono"
            name="key"
            placeholder="KEY"
            maxlength={10}
            required
          />
          <input class="input w-64" name="name" placeholder="Project name" required />
          <button class="btn btn-primary" type="submit">
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
                <span class="text-sm font-normal text-muted-foreground">
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
        <PageHead title={project.name} sub={`${all.length} issues · ${blockedCount} blocked`} />
        <form method="get" action={`/p/${project.key}`}>
          <div class="mb-4 flex items-center gap-2">
            <input
              class="input w-full flex-1 font-mono text-sm"
              name="f"
              value={filterLine}
              placeholder="Filter: status:open,in_progress kind:epic assignee:name label:mcp free text…"
              spellcheck={false}
              aria-label="filter"
            />
          </div>
        </form>
        {filtered.length === 0 ? (
          <p class={EMPTY}>No issues match.</p>
        ) : (
          <div class="card overflow-x-auto">
            <table class="w-full border-collapse">
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
              <a class="hover:underline" href={`/p/${issue.project}`}>
                {issue.project}
              </a>
            </b>{" "}
            / {issue.key}
          </>
        }
      >
        <div class="grid grid-cols-1 items-start gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <main>
            <div class="mb-1">
              <span class={KEY_TEXT}>{issue.key}</span>
              <h1 class="mt-1 mb-0 text-3xl font-semibold tracking-tight text-balance">
                {issue.title}
              </h1>
            </div>
            <div class="mt-3 mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
              <StatusBadge status={issue.status} />
              <PriorityTag priority={issue.priority} />
              <BlockedFlag blockedBy={issue.blockedBy} />
              {epic ? (
                <span class="text-sm text-muted-foreground">
                  in epic{" "}
                  <a
                    class="font-medium text-foreground underline-offset-4 hover:underline"
                    href={`/i/${epic.key}`}
                  >
                    {epic.key} · {epic.title}
                  </a>
                </span>
              ) : null}
            </div>

            {issue.description ? (
              <section class="mb-8">
                <SectionTitle>Description</SectionTitle>
                <Markdown source={issue.description} />
              </section>
            ) : null}

            {issue.links.length > 0 ? (
              <section class="mb-8">
                <SectionTitle>Links</SectionTitle>
                <ul class="m-0 grid list-none gap-1.5 p-0">
                  {issue.links.map((l) => (
                    <li class="flex flex-wrap items-center gap-3">
                      <span class="w-24 text-sm text-muted-foreground">
                        {linkLabel(l.type, l.direction)}
                      </span>
                      <a
                        class="font-mono text-sm font-medium text-foreground hover:underline"
                        href={`/i/${l.otherKey}`}
                      >
                        {l.otherKey}
                      </a>
                      <StatusBadge status={l.otherStatus} />
                      <span>{l.otherTitle}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section class="mb-8">
              <SectionTitle>Activity</SectionTitle>
              {issue.comments.length === 0 ? <p class={EMPTY}>No comments yet.</p> : null}
              {issue.comments.map((comment) => (
                <div
                  class={`card mb-3 px-5 py-4 ${
                    comment.authorType === "agent" ? "border-l-2 border-l-amber-400" : ""
                  }`}
                >
                  <div class="mb-1.5 text-sm text-muted-foreground">
                    <ActorName type={comment.authorType} name={comment.authorName} />{" "}
                    <time class="text-muted-foreground/70" title={absTime(comment.createdAt)}>
                      · {timeAgo(comment.createdAt)} ago
                    </time>
                  </div>
                  <Markdown source={comment.body} />
                </div>
              ))}
              <form class="mt-4" method="post" action={`/i/${issue.key}/comment`}>
                <textarea
                  class="input mb-2 block h-auto min-h-20 w-full resize-y py-2"
                  name="body"
                  placeholder="Write a comment…"
                  aria-label="comment"
                  required
                />
                <button class="btn btn-primary" type="submit">
                  Post comment
                </button>
              </form>
            </section>
          </main>

          <aside>
            <dl class="card m-0 grid grid-cols-[max-content_1fr] items-center gap-x-5 gap-y-3 p-5">
              <dt class="text-sm text-muted-foreground">Status</dt>
              <dd class="m-0">
                <form method="post" action={`/i/${issue.key}/update`}>
                  <select
                    class="input cursor-pointer"
                    name="status"
                    aria-label="status"
                    data-autosubmit
                  >
                    {catalog.map((s) => (
                      <option value={s.name} selected={s.name === issue.status}>
                        {s.name}
                      </option>
                    ))}
                  </select>{" "}
                  <noscript>
                    <button class="btn" type="submit">
                      set
                    </button>
                  </noscript>
                </form>
              </dd>
              <dt class="text-sm text-muted-foreground">Priority</dt>
              <dd class="m-0">
                <form method="post" action={`/i/${issue.key}/update`}>
                  <select
                    class="input cursor-pointer"
                    name="priority"
                    aria-label="priority"
                    data-autosubmit
                  >
                    {[0, 1, 2, 3, 4].map((p) => (
                      <option value={String(p)} selected={p === issue.priority}>
                        P{p}
                      </option>
                    ))}
                  </select>{" "}
                  <noscript>
                    <button class="btn" type="submit">
                      set
                    </button>
                  </noscript>
                </form>
              </dd>
              <dt class="text-sm text-muted-foreground">Assignee</dt>
              <dd class="m-0">
                {issue.assignee ? (
                  <ActorName type={issue.assigneeType ?? "human"} name={issue.assignee} />
                ) : (
                  "—"
                )}
              </dd>
              <dt class="text-sm text-muted-foreground">Labels</dt>
              <dd class="m-0">{issue.labels.length ? <Labels labels={issue.labels} /> : "—"}</dd>
              <dt class="text-sm text-muted-foreground">Created</dt>
              <dd class={`m-0 ${KEY_TEXT}`} title={absTime(issue.createdAt)}>
                {timeAgo(issue.createdAt)} ago
              </dd>
              <dt class="text-sm text-muted-foreground">Updated</dt>
              <dd class={`m-0 ${KEY_TEXT}`} title={absTime(issue.updatedAt)}>
                {timeAgo(issue.updatedAt)} ago
              </dd>
              {issue.closedAt ? (
                <>
                  <dt class="text-sm text-muted-foreground">Closed</dt>
                  <dd class={`m-0 ${KEY_TEXT}`} title={absTime(issue.closedAt)}>
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
        <PageHead
          title="Ready work"
          sub="unblocked open issues, as agents see them (priority, then oldest)"
        />
        <form method="get" action="/ready">
          <div class="mb-4 flex items-center gap-2">
            <select
              class="input cursor-pointer"
              name="project"
              aria-label="project"
              data-autosubmit
            >
              <option value="">all projects</option>
              {projects.map((p) => (
                <option value={p.key} selected={p.key === selected}>
                  {p.key} · {p.name}
                </option>
              ))}
            </select>
            <noscript>
              <button class="btn" type="submit">
                filter
              </button>
            </noscript>
          </div>
        </form>
        {issues.length === 0 ? (
          <p class={EMPTY}>Nothing ready — everything is either done, blocked, or claimed.</p>
        ) : (
          <div class="card overflow-x-auto">
            <table class="w-full border-collapse">
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

  const PLAIN_TH =
    "h-10 px-4 text-left align-middle text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground";
  const PLAIN_TD = "px-4 py-2.5 align-middle";

  const TokensPage = (props: { created?: { name: string; token: string }; error?: string }) => {
    const tokens = listTokens(db);
    return (
      <Layout title="tokens" active="tokens" version={version}>
        <PageHead title="Agent tokens" sub="bearer tokens for MCP and REST access" />
        {props.error ? <div class="notice error">{props.error}</div> : null}
        {props.created ? (
          <div class="notice">
            Token <b>{props.created.name}</b> created — copy it now, it is shown only once:
            <code class="mt-2 block overflow-x-auto rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs text-foreground select-all">
              {props.created.token}
            </code>
          </div>
        ) : null}
        {tokens.length === 0 ? (
          <p class={EMPTY}>No tokens yet.</p>
        ) : (
          <div class="card overflow-x-auto">
            <table class="w-full border-collapse">
              <thead>
                <tr class="border-b border-border bg-muted/40">
                  <th class={PLAIN_TH}>Name</th>
                  <th class={PLAIN_TH}>Created</th>
                  <th class={PLAIN_TH}>Last used</th>
                  <th class={PLAIN_TH}>Status</th>
                  <th class={PLAIN_TH} />
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr class="border-b border-border last:border-0 hover:bg-muted/50">
                    <td
                      class={`${PLAIN_TD} ${t.revokedAt ? "text-muted-foreground line-through" : ""}`}
                    >
                      <ActorName type="agent" name={t.name} />
                    </td>
                    <td class={`${PLAIN_TD} ${KEY_TEXT}`}>{absTime(t.createdAt)}</td>
                    <td class={`${PLAIN_TD} ${KEY_TEXT}`}>
                      {t.lastUsedAt ? `${timeAgo(t.lastUsedAt)} ago` : "never"}
                    </td>
                    <td class={PLAIN_TD}>
                      {t.revokedAt ? (
                        <span class="st st-cancelled">revoked</span>
                      ) : (
                        <span class="st st-done">active</span>
                      )}
                    </td>
                    <td class={PLAIN_TD}>
                      {t.revokedAt ? null : (
                        <form method="post" action={`/tokens/${t.id}/revoke`}>
                          <button class="btn btn-danger" type="submit">
                            Revoke
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form class={INLINE_FORM} method="post" action="/tokens">
          <input class="input w-72" name="name" placeholder="token name (e.g. scout-1)" required />
          <button class="btn btn-primary" type="submit">
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
