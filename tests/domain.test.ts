import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Connection } from "../src/db/connect.js";
import {
  addComment,
  closeIssue,
  createIssue,
  createProject,
  DomainError,
  deleteIssue,
  getIssue,
  linkIssues,
  listIssues,
  listProjects,
  readyWork,
  unlinkIssues,
  updateIssue,
} from "../src/domain/index.js";
import { agent, human, testDb } from "./helpers.js";

let conn: Connection;
beforeEach(async () => {
  conn = await testDb();
  createProject(conn.db, human, { key: "AGT", name: "Agenticket" });
});
afterEach(() => conn.close());

describe("projects", () => {
  it("creates with uppercase key and rejects invalid keys", () => {
    const p = createProject(conn.db, human, { key: "web", name: "Web" });
    expect(p.key).toBe("WEB");
    expect(() => createProject(conn.db, human, { key: "1BAD", name: "x" })).toThrow(DomainError);
    expect(() => createProject(conn.db, human, { key: "AGT", name: "dupe" })).toThrow(/exists/);
    expect(listProjects(conn.db).map((p) => p.key)).toEqual(["AGT", "WEB"]);
  });
});

describe("issues", () => {
  it("allocates sequential keys per project", () => {
    const a = createIssue(conn.db, agent, { project: "AGT", title: "first" });
    const b = createIssue(conn.db, agent, { project: "agt", title: "second" });
    expect(a.key).toBe("AGT-1");
    expect(b.key).toBe("AGT-2");
    expect(a.status).toBe("open");
  });

  it("supports epics and enforces hierarchy rules", () => {
    const epic = createIssue(conn.db, agent, { project: "AGT", title: "Big epic", kind: "epic" });
    const child = createIssue(conn.db, agent, { project: "AGT", title: "child", epic: epic.key });
    expect(child.epic).toBe(epic.key);
    // epic cannot have a parent epic
    expect(() =>
      createIssue(conn.db, agent, { project: "AGT", title: "x", kind: "epic", epic: epic.key }),
    ).toThrow(/epic/);
    // parent must be an epic
    expect(() =>
      createIssue(conn.db, agent, { project: "AGT", title: "x", epic: child.key }),
    ).toThrow(/not an epic/);
    // epic must be same project
    createProject(conn.db, human, { key: "OTH", name: "Other" });
    expect(() =>
      createIssue(conn.db, agent, { project: "OTH", title: "x", epic: epic.key }),
    ).toThrow(/different project/);
  });

  it("updates status with catalog validation and closedAt handling", () => {
    const i = createIssue(conn.db, agent, { project: "AGT", title: "t" });
    expect(() => updateIssue(conn.db, agent, i.key, { status: "bogus" })).toThrow(/unknown status/);
    const closed = updateIssue(conn.db, agent, i.key, { status: "done" });
    expect(closed.closedAt).not.toBeNull();
    const reopened = updateIssue(conn.db, agent, i.key, { status: "open" });
    expect(reopened.closedAt).toBeNull();
  });

  it("stamps agent audit fields", () => {
    const i = createIssue(conn.db, agent, { project: "AGT", title: "t" });
    const c = addComment(conn.db, agent, i.key, "working on it");
    expect(c.authorType).toBe("agent");
    expect(c.authorTokenId).toBe(1);
    expect(c.authorName).toBe("test-agent");
    expect(getIssue(conn.db, i.key).comments).toHaveLength(1);
  });

  it("manages labels via update patch", () => {
    const i = createIssue(conn.db, agent, { project: "AGT", title: "t", labels: ["bug"] });
    expect(i.labels).toEqual(["bug"]);
    const upd = updateIssue(conn.db, agent, i.key, { addLabels: ["ui"], removeLabels: ["bug"] });
    expect(upd.labels).toEqual(["ui"]);
  });

  it("filters in listIssues", () => {
    const epic = createIssue(conn.db, agent, { project: "AGT", title: "epic", kind: "epic" });
    createIssue(conn.db, agent, {
      project: "AGT",
      title: "login broken",
      epic: epic.key,
      labels: ["bug"],
    });
    createIssue(conn.db, agent, { project: "AGT", title: "add dark mode", assignee: "bot-1" });
    expect(listIssues(conn.db, { project: "AGT", kind: "issue" })).toHaveLength(2);
    expect(listIssues(conn.db, { text: "login" })[0]?.title).toBe("login broken");
    expect(listIssues(conn.db, { labels: ["bug"] })).toHaveLength(1);
    expect(listIssues(conn.db, { assignee: "bot-1" })).toHaveLength(1);
    expect(listIssues(conn.db, { epic: epic.key })).toHaveLength(1);
  });

  it("deletes issues, detaching epic children", () => {
    const epic = createIssue(conn.db, agent, { project: "AGT", title: "epic", kind: "epic" });
    const child = createIssue(conn.db, agent, { project: "AGT", title: "c", epic: epic.key });
    deleteIssue(conn.db, human, epic.key);
    expect(getIssue(conn.db, child.key).epic).toBeNull();
  });
});

describe("links", () => {
  it("normalizes blocked_by to blocks", () => {
    const a = createIssue(conn.db, agent, { project: "AGT", title: "a" });
    const b = createIssue(conn.db, agent, { project: "AGT", title: "b" });
    const link = linkIssues(conn.db, agent, a.key, b.key, "blocked_by");
    expect(link).toEqual({ from: b.key, to: a.key, type: "blocks" });
    expect(getIssue(conn.db, a.key).blockedBy).toEqual([b.key]);
  });

  it("rejects self-links, duplicates, epic DAG links and cycles", () => {
    const a = createIssue(conn.db, agent, { project: "AGT", title: "a" });
    const b = createIssue(conn.db, agent, { project: "AGT", title: "b" });
    const c = createIssue(conn.db, agent, { project: "AGT", title: "c" });
    const epic = createIssue(conn.db, agent, { project: "AGT", title: "e", kind: "epic" });
    expect(() => linkIssues(conn.db, agent, a.key, a.key, "blocks")).toThrow(/itself/);
    linkIssues(conn.db, agent, a.key, b.key, "blocks");
    expect(() => linkIssues(conn.db, agent, a.key, b.key, "blocks")).toThrow(/exists/);
    expect(() => linkIssues(conn.db, agent, epic.key, a.key, "blocks")).toThrow(/epic/i);
    linkIssues(conn.db, agent, b.key, c.key, "blocks");
    expect(() => linkIssues(conn.db, agent, c.key, a.key, "blocks")).toThrow(/cycle/);
    // relates_to is not a DAG type: reverse direction fine
    linkIssues(conn.db, agent, c.key, a.key, "relates_to");
  });

  it("unlinks and errors when link missing", () => {
    const a = createIssue(conn.db, agent, { project: "AGT", title: "a" });
    const b = createIssue(conn.db, agent, { project: "AGT", title: "b" });
    linkIssues(conn.db, agent, a.key, b.key, "depends_on");
    unlinkIssues(conn.db, agent, a.key, b.key, "depends_on");
    expect(() => unlinkIssues(conn.db, agent, a.key, b.key, "depends_on")).toThrow(/not found/);
  });
});

describe("ready work + close", () => {
  it("excludes blocked issues and returns them once unblocked", () => {
    const blocker = createIssue(conn.db, agent, { project: "AGT", title: "blocker", priority: 1 });
    const blocked = createIssue(conn.db, agent, { project: "AGT", title: "blocked", priority: 0 });
    const free = createIssue(conn.db, agent, { project: "AGT", title: "free", priority: 3 });
    linkIssues(conn.db, agent, blocker.key, blocked.key, "blocks");

    let ready = readyWork(conn.db, { project: "AGT" });
    expect(ready.map((i) => i.key)).toEqual([blocker.key, free.key]);

    const result = closeIssue(conn.db, agent, blocker.key);
    expect(result.unblocked).toEqual([blocked.key]);

    ready = readyWork(conn.db, { project: "AGT" });
    // blocked has priority 0 → now first
    expect(ready.map((i) => i.key)).toEqual([blocked.key, free.key]);
  });

  it("excludes manually-blocked and epics; respects assignee filter", () => {
    createIssue(conn.db, agent, { project: "AGT", title: "epic", kind: "epic" });
    const ext = createIssue(conn.db, agent, { project: "AGT", title: "waiting on human" });
    updateIssue(conn.db, agent, ext.key, { status: "blocked" });
    const mine = createIssue(conn.db, agent, { project: "AGT", title: "mine", assignee: "bot-1" });
    expect(readyWork(conn.db).map((i) => i.key)).toEqual([mine.key]);
    expect(readyWork(conn.db, { assignee: "bot-1" }).map((i) => i.key)).toEqual([mine.key]);
    expect(readyWork(conn.db, { assignee: "bot-2" })).toEqual([]);
  });

  it("close with cancelled still unblocks (done category)", () => {
    const a = createIssue(conn.db, agent, { project: "AGT", title: "a" });
    const b = createIssue(conn.db, agent, { project: "AGT", title: "b" });
    linkIssues(conn.db, agent, a.key, b.key, "blocks");
    const res = closeIssue(conn.db, agent, a.key, "cancelled");
    expect(res.issue.status).toBe("cancelled");
    expect(res.unblocked).toEqual([b.key]);
  });
});
