import { beforeAll, describe, expect, it } from "vitest";
import { setAdminPassword } from "../src/auth/password.js";
import type { Connection } from "../src/db/connect.js";
import { addComment, createIssue, linkIssues } from "../src/domain/index.js";
import { createApp } from "../src/server.js";
import { parseFilterLine } from "../src/web/routes.js";
import { agent, testDb } from "./helpers.js";

const PASSWORD = "hunter2!";

let conn: Connection;
let app: ReturnType<typeof createApp>;
let cookie: string;

async function get(path: string, init: RequestInit = {}) {
  return app.request(path, { ...init, headers: { cookie, ...(init.headers ?? {}) } });
}

async function postForm(path: string, fields: Record<string, string>) {
  return app.request(path, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

beforeAll(async () => {
  conn = await testDb();
  setAdminPassword(conn.db, PASSWORD);
  app = createApp({ version: "0.0.0-test", db: conn.db });

  const login = await app.request("/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: PASSWORD }).toString(),
  });
  const setCookie = login.headers.get("set-cookie");
  if (!setCookie) throw new Error("login did not set a session cookie");
  cookie = setCookie.split(";")[0] ?? "";

  return () => conn.close();
});

describe("web auth", () => {
  it("redirects unauthenticated page requests to /login", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("serves the login page and assets without a session", async () => {
    const login = await app.request("/login");
    expect(login.status).toBe(200);
    expect(await login.text()).toContain("agenticket");
    const css = await app.request("/assets/app.css");
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    const js = await app.request("/assets/app.js");
    expect(js.status).toBe(200);
  });

  it("rejects a wrong password with 401", async () => {
    const res = await app.request("/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: "nope" }).toString(),
    });
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Invalid password");
  });

  it("logs out and clears the session", async () => {
    // Use a separate session so the shared cookie stays valid for later tests.
    const login = await app.request("/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: PASSWORD }).toString(),
    });
    const other = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    const out = await app.request("/logout", { method: "POST", headers: { cookie: other } });
    expect(out.status).toBe(303);
    const after = await app.request("/", { headers: { cookie: other } });
    expect(after.status).toBe(303);
    expect(after.headers.get("location")).toBe("/login");
  });
});

describe("web pages", () => {
  it("creates a project from the UI", async () => {
    const res = await postForm("/projects", { key: "web", name: "Web project" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/p/WEB");
    const home = await get("/");
    expect(await home.text()).toContain("Web project");
  });

  it("shows agent-created issues with epic tree and derived blocked flag", async () => {
    const epic = createIssue(conn.db, agent, {
      project: "WEB",
      title: "Epic: hardening",
      kind: "epic",
    });
    const a = createIssue(conn.db, agent, {
      project: "WEB",
      title: "Retry on busy",
      epic: epic.key,
      priority: 1,
      labels: ["mcp"],
      assignee: "scout-1",
    });
    const b = createIssue(conn.db, agent, {
      project: "WEB",
      title: "Rate limiting",
      epic: epic.key,
    });
    linkIssues(conn.db, agent, a.key, b.key, "blocks");
    addComment(conn.db, agent, a.key, "claimed via ready queue");

    const res = await get("/p/WEB");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(epic.key);
    expect(html).toContain("Retry on busy");
    expect(html).toContain("└─"); // tree connector under the epic
    expect(html).toContain(`blocked by ${a.key}`); // derived, not stored
    expect(html).toContain("scout-1");
  });

  it("applies command-line filters", async () => {
    const res = await get(`/p/WEB?f=${encodeURIComponent("kind:epic")}`);
    const html = await res.text();
    expect(html).toContain("Epic: hardening");
    expect(html).not.toContain("Rate limiting");
    const none = await get(`/p/WEB?f=${encodeURIComponent("status:done")}`);
    expect(await none.text()).toContain("No issues match");
  });

  it("renders issue detail with links, comments, and agent attribution", async () => {
    const res = await get("/i/WEB-2");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Retry on busy");
    expect(html).toContain("blocks"); // link section
    expect(html).toContain("claimed via ready queue");
    expect(html).toContain("test-agent"); // comment author (token name)
    expect(html).toContain("Epic: hardening"); // epic breadcrumb
  });

  it("changes status and posts a comment via forms", async () => {
    const upd = await postForm("/i/WEB-2/update", { status: "in_progress" });
    expect(upd.status).toBe(303);
    const com = await postForm("/i/WEB-2/comment", { body: "looks good from the UI" });
    expect(com.status).toBe(303);
    const html = await (await get("/i/WEB-2")).text();
    expect(html).toContain("in progress");
    expect(html).toContain("looks good from the UI");
    expect(html).toContain('<span class="human">admin</span>'); // human attribution
  });

  it("shows the ready queue excluding blocked issues", async () => {
    const res = await get("/ready?project=WEB");
    const html = await res.text();
    expect(html).toContain("WEB-2"); // in_progress, unblocked
    expect(html).not.toContain(">WEB-3<"); // blocked by WEB-2
  });

  it("returns 404 page for unknown issues", async () => {
    const res = await get("/i/WEB-999");
    expect(res.status).toBe(404);
  });
});

describe("token admin", () => {
  it("creates a token, shows it exactly once, then revokes it", async () => {
    const created = await postForm("/tokens", { name: "ui-agent" });
    expect(created.status).toBe(201);
    const html = await created.text();
    const match = html.match(/agt_[A-Za-z0-9_-]+/);
    expect(match).not.toBeNull();

    const list = await (await get("/tokens")).text();
    expect(list).toContain("ui-agent");
    expect(list).not.toContain(match?.[0] ?? "___");

    // The fresh token authenticates against the REST API.
    const api = await app.request("/api/v1/projects", {
      headers: { authorization: `Bearer ${match?.[0]}` },
    });
    expect(api.status).toBe(200);

    const revoked = await postForm("/tokens/1/revoke", {});
    expect(revoked.status).toBe(303);
    const after = await (await get("/tokens")).text();
    expect(after).toContain("revoked");

    const apiAfter = await app.request("/api/v1/projects", {
      headers: { authorization: `Bearer ${match?.[0]}` },
    });
    expect(apiAfter.status).toBe(401);
  });

  it("rejects duplicate token names with an error notice", async () => {
    const res = await postForm("/tokens", { name: "ui-agent" });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("already exists");
  });
});

describe("parseFilterLine", () => {
  it("parses key:value tokens and free text", () => {
    expect(parseFilterLine("status:open,in_progress kind:issue label:mcp,db retry busy")).toEqual({
      status: ["open", "in_progress"],
      kind: "issue",
      labels: ["mcp", "db"],
      text: "retry busy",
    });
    expect(parseFilterLine("")).toEqual({});
    expect(parseFilterLine("epic:WEB-1 assignee:scout-1")).toEqual({
      epic: "WEB-1",
      assignee: "scout-1",
    });
  });
});
