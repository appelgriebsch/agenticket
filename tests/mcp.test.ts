import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { issues } from "../src/db/schema.js";
import { createToken } from "../src/auth/tokens.js";
import type { Db } from "../src/db/connect.js";
import { createApp } from "../src/server.js";
import { type RunningServer, serve } from "../src/serve.js";
import { testDb } from "./helpers.js";

let db: Db;
let server: RunningServer;
let url: URL;
let token: string;
const openClients: Client[] = [];

beforeEach(async () => {
  const conn = await testDb();
  db = conn.db;
  token = createToken(db, "mcp-test-agent").token;
  server = await serve(createApp({ version: "test", db }), { port: 0, host: "127.0.0.1" });
  url = new URL(`http://127.0.0.1:${server.port}/mcp`);
});

afterEach(async () => {
  await Promise.all(openClients.splice(0).map((c) => c.close().catch(() => {})));
  await server.stop();
});

async function mcpClient(bearer = token): Promise<Client> {
  const client = new Client({ name: "vitest", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { authorization: `Bearer ${bearer}` } },
  });
  await client.connect(transport);
  openClients.push(client);
  return client;
}

// biome-ignore lint/suspicious/noExplicitAny: tests assert on dynamic JSON
async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
  if (res.isError) throw new Error(text);
  return JSON.parse(text);
}

describe("mcp auth", () => {
  it("rejects requests without a token", async () => {
    await expect(mcpClient("")).rejects.toThrow(/unauthorized/);
  });

  it("rejects an invalid token", async () => {
    await expect(mcpClient("agt_bogus")).rejects.toThrow(/unauthorized/);
  });
});

describe("mcp session", () => {
  it("lists all 11 tools with descriptions", async () => {
    const client = await mcpClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "add_comment",
      "close_issue",
      "create_issue",
      "create_project",
      "get_issue",
      "link_issues",
      "list_issues",
      "list_projects",
      "ready_work",
      "unlink_issues",
      "update_issue",
    ]);
    for (const t of tools) expect(t.description).toBeTruthy();
  });

  it("runs the full scripted workflow: project → epic → issues → block → close → unblock", async () => {
    const client = await mcpClient();

    expect(await call(client, "list_projects")).toEqual([]);
    const project = await call(client, "create_project", { key: "AGT", name: "Agenticket" });
    expect(project.key).toBe("AGT");

    const epic = await call(client, "create_issue", {
      project: "AGT",
      title: "MCP endpoint",
      kind: "epic",
    });
    expect(epic.key).toBe("AGT-1");
    expect(epic.kind).toBe("epic");

    const a = await call(client, "create_issue", {
      project: "AGT",
      title: "Build server",
      epic: "AGT-1",
      priority: 1,
      labels: ["mcp"],
    });
    const b = await call(client, "create_issue", {
      project: "AGT",
      title: "Write tests",
      epic: "AGT-1",
      priority: 1,
    });
    expect([a.key, b.key]).toEqual(["AGT-2", "AGT-3"]);
    expect(a.epic).toBe("AGT-1");

    // AGT-2 blocks AGT-3 → ready_work must exclude AGT-3.
    const link = await call(client, "link_issues", { from: "AGT-2", to: "AGT-3", type: "blocks" });
    expect(link).toEqual({ from: "AGT-2", to: "AGT-3", type: "blocks" });

    let ready = await call(client, "ready_work", { project: "AGT" });
    expect(ready.map((r: { key: string }) => r.key)).toEqual(["AGT-2"]);

    const detail = await call(client, "get_issue", { key: "agt-3" }); // case-insensitive
    expect(detail.blockedBy).toEqual(["AGT-2"]);
    expect(detail.links).toHaveLength(1);

    // Work AGT-2: status, comment, close with closing comment.
    const updated = await call(client, "update_issue", {
      key: "AGT-2",
      status: "in_progress",
      add_labels: ["server"],
    });
    expect(updated.status).toBe("in_progress");
    expect(updated.labels.sort()).toEqual(["mcp", "server"]);

    await call(client, "add_comment", { issue: "AGT-2", body: "transport wired up" });
    const closed = await call(client, "close_issue", { issue: "AGT-2", comment: "shipped" });
    expect(closed.status).toBe("done");
    expect(closed.unblocked).toEqual(["AGT-3"]);
    expect(closed.comments).toHaveLength(2);
    expect(closed.comments[1].authorName).toBe("mcp-test-agent");

    // AGT-3 is now ready.
    ready = await call(client, "ready_work", { project: "AGT" });
    expect(ready.map((r: { key: string }) => r.key)).toEqual(["AGT-3"]);

    // unlink + list_issues filters still behave.
    await call(client, "unlink_issues", { from: "AGT-2", to: "AGT-3", type: "blocks" });
    const open = await call(client, "list_issues", {
      project: "AGT",
      status: ["open"],
      kind: "issue",
    });
    expect(open.map((r: { key: string }) => r.key)).toEqual(["AGT-3"]);
  });

  it("returns actionable tool errors instead of protocol errors", async () => {
    const client = await mcpClient();
    const res = await client.callTool({ name: "get_issue", arguments: { key: "AGT-99" } });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(text).toContain("AGT-99");
    expect(text).toContain("list_issues");
  });

  it("stamps the token identity on created issues (audit)", async () => {
    const client = await mcpClient();
    await call(client, "create_project", { key: "AUD", name: "Audit" });
    await call(client, "create_issue", { project: "AUD", title: "trace me" });
    const row = db
      .select({ createdByTokenId: issues.createdByTokenId })
      .from(issues)
      .where(eq(issues.key, "AUD-1"))
      .get();
    expect(row?.createdByTokenId).toBe(1);
  });
});

describe("mcp concurrency", () => {
  it("8 parallel clients create 40 issues with unique sequential keys", async () => {
    const setup = await mcpClient();
    await call(setup, "create_project", { key: "CONC", name: "Concurrency" });

    const clients = await Promise.all(Array.from({ length: 8 }, () => mcpClient()));
    const created = await Promise.all(
      clients.flatMap((client, ci) =>
        Array.from({ length: 5 }, (_, i) =>
          call(client, "create_issue", { project: "CONC", title: `c${ci}-i${i}` }),
        ),
      ),
    );

    const keys = created.map((c) => c.key);
    expect(new Set(keys).size).toBe(40);
    expect(keys.sort()).toContain("CONC-40");
    const listed = await call(setup, "list_issues", { project: "CONC", limit: 100 });
    expect(listed).toHaveLength(40);
  });
});
