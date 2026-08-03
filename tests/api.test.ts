import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { setAdminPassword } from "../src/auth/password.js";
import { createToken } from "../src/auth/tokens.js";
import type { Db } from "../src/db/connect.js";
import { createApp } from "../src/server.js";
import { testDb } from "./helpers.js";

const PASSWORD = "correct horse battery staple";

let app: Hono;
let db: Db;
let bearer: Record<string, string>;

beforeEach(async () => {
  const conn = await testDb();
  db = conn.db;
  setAdminPassword(db, PASSWORD);
  const created = createToken(db, "test-agent");
  bearer = { authorization: `Bearer ${created.token}` };
  app = createApp({ version: "test", db });
});

function json(method: string, body: unknown, headers: Record<string, string> = {}) {
  return {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  };
}

// biome-ignore lint/suspicious/noExplicitAny: tests assert on dynamic JSON
function jso(res: Response): Promise<any> {
  return res.json();
}

async function login(): Promise<Record<string, string>> {
  const res = await app.request("/api/v1/auth/login", json("POST", { password: PASSWORD }));
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return { cookie: (setCookie as string).split(";")[0] as string };
}

async function seedProject(key = "AGT") {
  const res = await app.request(
    "/api/v1/projects",
    json("POST", { key, name: "Agenticket" }, bearer),
  );
  expect(res.status).toBe(201);
  return jso(res);
}

async function seedIssue(input: Record<string, unknown>) {
  const res = await app.request(
    "/api/v1/issues",
    json("POST", { project: "AGT", ...input }, bearer),
  );
  expect(res.status).toBe(201);
  return jso(res);
}

describe("auth", () => {
  it("rejects unauthenticated requests with a 401 envelope", async () => {
    const res = await app.request("/api/v1/projects");
    expect(res.status).toBe(401);
    const body = await jso(res);
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toBeTruthy();
  });

  it("rejects a wrong password", async () => {
    const res = await app.request("/api/v1/auth/login", json("POST", { password: "nope" }));
    expect(res.status).toBe(401);
  });

  it("logs in with the admin password and authenticates via session cookie", async () => {
    const cookie = await login();
    const res = await app.request("/api/v1/projects", { headers: cookie });
    expect(res.status).toBe(200);
    expect(await jso(res)).toEqual([]);
  });

  it("logout invalidates the session", async () => {
    const cookie = await login();
    const out = await app.request("/api/v1/auth/logout", { method: "POST", headers: cookie });
    expect(out.status).toBe(200);
    const res = await app.request("/api/v1/projects", { headers: cookie });
    expect(res.status).toBe(401);
  });

  it("authenticates agents via bearer token and rejects garbage tokens", async () => {
    const ok = await app.request("/api/v1/projects", { headers: bearer });
    expect(ok.status).toBe(200);
    const bad = await app.request("/api/v1/projects", {
      headers: { authorization: "Bearer agt_bogus" },
    });
    expect(bad.status).toBe(401);
  });
});

describe("projects", () => {
  it("creates, gets, patches, and lists projects without leaking internal ids", async () => {
    const project = await seedProject();
    expect(project.key).toBe("AGT");
    expect(project.id).toBeUndefined();
    expect(project.nextIssueNumber).toBeUndefined();

    const got = await app.request("/api/v1/projects/agt", { headers: bearer });
    expect(got.status).toBe(200);

    const patched = await app.request(
      "/api/v1/projects/AGT",
      json("PATCH", { description: "tracker" }, bearer),
    );
    expect((await jso(patched)).description).toBe("tracker");

    const list = await app.request("/api/v1/projects", { headers: bearer });
    expect((await jso(list)).length).toBe(1);
  });

  it("maps domain errors: 404 unknown key, 409 duplicate, 400 invalid", async () => {
    await seedProject();
    const missing = await app.request("/api/v1/projects/NOPE", { headers: bearer });
    expect(missing.status).toBe(404);
    expect((await jso(missing)).error.code).toBe("not_found");

    const dup = await app.request(
      "/api/v1/projects",
      json("POST", { key: "AGT", name: "again" }, bearer),
    );
    expect(dup.status).toBe(409);

    const invalid = await app.request(
      "/api/v1/projects",
      json("POST", { key: "1BAD", name: "x" }, bearer),
    );
    expect(invalid.status).toBe(400);
    expect((await jso(invalid)).error.code).toBe("validation");
  });

  it("rejects bodies with unknown fields and non-JSON bodies", async () => {
    const unknown = await app.request(
      "/api/v1/projects",
      json("POST", { key: "AGT", name: "x", nope: 1 }, bearer),
    );
    expect(unknown.status).toBe(400);

    const notJson = await app.request("/api/v1/projects", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json", ...bearer },
    });
    expect(notJson.status).toBe(400);
  });

  it("only admins can delete projects", async () => {
    await seedProject();
    const asAgent = await app.request("/api/v1/projects/AGT", {
      method: "DELETE",
      headers: bearer,
    });
    expect(asAgent.status).toBe(403);

    const cookie = await login();
    const asAdmin = await app.request("/api/v1/projects/AGT", {
      method: "DELETE",
      headers: cookie,
    });
    expect(asAdmin.status).toBe(200);
  });
});

describe("issues", () => {
  beforeEach(() => seedProject());

  it("creates and fetches an issue by key", async () => {
    const issue = await seedIssue({ title: "First", labels: ["bug"], priority: 1 });
    expect(issue.key).toBe("AGT-1");
    expect(issue.labels).toEqual(["bug"]);

    const got = await app.request("/api/v1/issues/agt-1", { headers: bearer });
    expect(got.status).toBe(200);
    expect((await jso(got)).title).toBe("First");
  });

  it("patches status/assignee and filters lists", async () => {
    await seedIssue({ title: "one", labels: ["bug"] });
    await seedIssue({ title: "two" });

    const patched = await app.request(
      "/api/v1/issues/AGT-1",
      json("PATCH", { status: "in_progress", assignee: "claude" }, bearer),
    );
    expect(patched.status).toBe(200);
    const body = await jso(patched);
    expect(body.status).toBe("in_progress");
    expect(body.assignee).toBe("claude");

    const byStatus = await app.request("/api/v1/issues?status=in_progress", { headers: bearer });
    expect((await jso(byStatus)).map((i: { key: string }) => i.key)).toEqual(["AGT-1"]);

    const byLabel = await app.request("/api/v1/issues?label=bug", { headers: bearer });
    expect((await jso(byLabel)).length).toBe(1);

    const byText = await app.request("/api/v1/issues?q=two", { headers: bearer });
    expect((await jso(byText)).map((i: { key: string }) => i.key)).toEqual(["AGT-2"]);

    const badStatus = await app.request(
      "/api/v1/issues/AGT-1",
      json("PATCH", { status: "bogus" }, bearer),
    );
    expect(badStatus.status).toBe(400);
  });

  it("supports epics as parents", async () => {
    await seedIssue({ title: "Epic", kind: "epic" });
    const child = await seedIssue({ title: "child", epic: "AGT-1" });
    expect(child.epic).toBe("AGT-1");

    const children = await app.request("/api/v1/issues?epic=AGT-1", { headers: bearer });
    expect((await jso(children)).length).toBe(1);
  });

  it("closing via PATCH reports newly-unblocked issues", async () => {
    await seedIssue({ title: "blocker" });
    await seedIssue({ title: "blocked" });
    await app.request("/api/v1/issues/AGT-1/links", json("POST", { to: "AGT-2", type: "blocks" }, bearer));

    const closed = await app.request(
      "/api/v1/issues/AGT-1",
      json("PATCH", { status: "done" }, bearer),
    );
    const body = await jso(closed);
    expect(body.status).toBe("done");
    expect(body.unblocked).toEqual(["AGT-2"]);
  });

  it("only admins can delete issues", async () => {
    await seedIssue({ title: "x" });
    const asAgent = await app.request("/api/v1/issues/AGT-1", {
      method: "DELETE",
      headers: bearer,
    });
    expect(asAgent.status).toBe(403);

    const cookie = await login();
    const asAdmin = await app.request("/api/v1/issues/AGT-1", {
      method: "DELETE",
      headers: cookie,
    });
    expect(asAdmin.status).toBe(200);
  });
});

describe("comments", () => {
  beforeEach(async () => {
    await seedProject();
    await seedIssue({ title: "x" });
  });

  it("adds and lists comments with the actor's identity", async () => {
    const created = await app.request(
      "/api/v1/issues/AGT-1/comments",
      json("POST", { body: "hello" }, bearer),
    );
    expect(created.status).toBe(201);
    const comment = await jso(created);
    expect(comment.authorType).toBe("agent");
    expect(comment.authorName).toBe("test-agent");

    const list = await app.request("/api/v1/issues/AGT-1/comments", { headers: bearer });
    expect((await jso(list)).length).toBe(1);
  });

  it("rejects empty comments", async () => {
    const res = await app.request(
      "/api/v1/issues/AGT-1/comments",
      json("POST", { body: "" }, bearer),
    );
    expect(res.status).toBe(400);
  });
});

describe("links", () => {
  beforeEach(async () => {
    await seedProject();
    await seedIssue({ title: "a" });
    await seedIssue({ title: "b" });
  });

  it("creates links, normalizes blocked_by, and unlinks", async () => {
    const created = await app.request(
      "/api/v1/issues/AGT-1/links",
      json("POST", { to: "AGT-2", type: "blocked_by" }, bearer),
    );
    expect(created.status).toBe(201);
    // blocked_by is stored inverted: AGT-2 blocks AGT-1
    expect(await jso(created)).toEqual({ from: "AGT-2", to: "AGT-1", type: "blocks" });

    const issue = await jso(await app.request("/api/v1/issues/AGT-1", { headers: bearer }));
    expect(issue.blockedBy).toEqual(["AGT-2"]);

    const removed = await app.request(
      "/api/v1/issues/AGT-1/links",
      json("DELETE", { to: "AGT-2", type: "blocked_by" }, bearer),
    );
    expect(removed.status).toBe(200);
  });

  it("rejects link cycles through the API", async () => {
    await app.request("/api/v1/issues/AGT-1/links", json("POST", { to: "AGT-2", type: "blocks" }, bearer));
    const cycle = await app.request(
      "/api/v1/issues/AGT-2/links",
      json("POST", { to: "AGT-1", type: "blocks" }, bearer),
    );
    expect(cycle.status).toBe(400);
    expect((await jso(cycle)).error.message).toContain("cycle");
  });
});

describe("ready work", () => {
  it("excludes blocked issues", async () => {
    await seedProject();
    await seedIssue({ title: "blocker" });
    await seedIssue({ title: "blocked" });
    await app.request("/api/v1/issues/AGT-1/links", json("POST", { to: "AGT-2", type: "blocks" }, bearer));

    const res = await app.request("/api/v1/ready?project=AGT", { headers: bearer });
    expect(res.status).toBe(200);
    expect((await jso(res)).map((i: { key: string }) => i.key)).toEqual(["AGT-1"]);
  });
});

describe("tokens", () => {
  it("is admin-only", async () => {
    const asAgent = await app.request("/api/v1/tokens", { headers: bearer });
    expect(asAgent.status).toBe(403);
  });

  it("creates (plaintext shown once), lists, and revokes tokens", async () => {
    const cookie = await login();
    const created = await app.request(
      "/api/v1/tokens",
      json("POST", { name: "ci-bot" }, cookie),
    );
    expect(created.status).toBe(201);
    const token = await jso(created);
    expect(token.token).toMatch(/^agt_/);

    const list = await jso(await app.request("/api/v1/tokens", { headers: cookie }));
    expect(list.map((t: { name: string }) => t.name).sort()).toEqual(["ci-bot", "test-agent"]);
    expect(list.every((t: { token?: string }) => t.token === undefined)).toBe(true);

    // revoke the ci-bot token: its bearer auth stops working
    const revoke = await app.request(`/api/v1/tokens/${token.id}`, {
      method: "DELETE",
      headers: cookie,
    });
    expect(revoke.status).toBe(200);
    const rejected = await app.request("/api/v1/projects", {
      headers: { authorization: `Bearer ${token.token}` },
    });
    expect(rejected.status).toBe(401);
  });
});
