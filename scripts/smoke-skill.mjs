// Phase 7 dogfood smoke: two agents follow skill/SKILL.md's loop over live MCP
// HTTP, concurrently, against one instance; the audit trail is then verified
// through the web UI. Run: `npx tsx scripts/smoke-skill.mjs` and `bun scripts/smoke-skill.mjs`.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { setAdminPassword } from "../src/auth/password.ts";
import { createToken } from "../src/auth/tokens.ts";
import { connect } from "../src/db/connect.ts";
import { migrate } from "../src/db/migrate.ts";
import { createApp } from "../src/server.ts";
import { serve } from "../src/serve.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(`dogfood failed: ${msg}`);
}

const dir = mkdtempSync(join(tmpdir(), "agenticket-dogfood-"));
const conn = await connect(join(dir, "dogfood.db"));
migrate(conn.db);
setAdminPassword(conn.db, "dogfood-pass-1");
const t1 = createToken(conn.db, "scout-1").token;
const t2 = createToken(conn.db, "scout-2").token;
const server = await serve(createApp({ version: "dogfood", db: conn.db }), {
  port: 0,
  host: "127.0.0.1",
});
const base = `http://127.0.0.1:${server.port}`;
const url = new URL(`${base}/mcp`);

async function agentClient(token) {
  const client = new Client({ name: "dogfood", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  clients.push(client);
  return async (name, args = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? "";
    if (res.isError) throw new Error(`${name}: ${text}`);
    return JSON.parse(text);
  };
}

const clients = [];
const scout1 = await agentClient(t1);
const scout2 = await agentClient(t2);

// Seed board (scout-1 acting as planner).
await scout1("create_project", { key: "DOG", name: "Dogfood" });
await scout1("create_issue", { project: "DOG", title: "Implement retry", priority: 1 });
await scout1("create_issue", { project: "DOG", title: "Write docs", priority: 3 });

// scout-1 runs the SKILL.md loop.
async function skillLoop() {
  // 1. find work
  let ready = await scout1("ready_work", { project: "DOG" });
  assert(ready[0].key === "DOG-1", `top ready should be DOG-1, got ${ready[0]?.key}`);
  // 2. claim
  await scout1("update_issue", { key: "DOG-1", status: "in_progress", assignee: "scout-1" });
  // 3. narrate
  await scout1("add_comment", { issue: "DOG-1", body: "Claimed. Reproducing the failure first." });
  // 4. discovered work: a blocker
  const blocker = await scout1("create_issue", {
    project: "DOG",
    title: "Fix flaky WAL checkpoint",
    priority: 1,
  });
  await scout1("link_issues", { from: blocker.key, to: "DOG-1", type: "blocks" });
  ready = await scout1("ready_work", { project: "DOG" });
  assert(!ready.some((r) => r.key === "DOG-1"), "DOG-1 should leave ready while blocked");
  assert(ready.some((r) => r.key === blocker.key), "blocker should be ready");
  const detail = await scout1("get_issue", { key: "DOG-1" });
  assert(detail.blockedBy.includes(blocker.key), "derived blockedBy should list the blocker");
  // work the blocker, close it
  await scout1("update_issue", { key: blocker.key, status: "in_progress", assignee: "scout-1" });
  const closedBlocker = await scout1("close_issue", {
    issue: blocker.key,
    comment: "Checkpoint fixed in tx helper.",
  });
  assert(closedBlocker.unblocked.includes("DOG-1"), "closing blocker should unblock DOG-1");
  // 5. close the original
  const closed = await scout1("close_issue", {
    issue: "DOG-1",
    comment: "Retry implemented; see src/domain/tx.ts.",
  });
  assert(closed.status === "done", "DOG-1 should be done");
  ready = await scout1("ready_work", { project: "DOG" });
  assert(ready[0]?.key === "DOG-2", `next ready should be DOG-2, got ${ready[0]?.key}`);
}

// scout-2 hammers the same instance concurrently (files + comments its own work).
async function secondAgent() {
  const keys = [];
  for (let i = 0; i < 15; i++) {
    const issue = await scout2("create_issue", {
      project: "DOG",
      title: `scout-2 task ${i}`,
      priority: 4,
    });
    keys.push(issue.key);
    await scout2("add_comment", { issue: issue.key, body: `note ${i} from scout-2` });
  }
  for (const key of keys) await scout2("close_issue", { issue: key, status: "cancelled" });
  return keys.length;
}

const [, created] = await Promise.all([skillLoop(), secondAgent()]);
assert(created === 15, "scout-2 should complete all 15 issues");

// Audit trail visible in the web UI, with per-token attribution.
const login = await fetch(`${base}/login`, {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ password: "dogfood-pass-1" }).toString(),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert(cookie, "admin login should set a cookie");
const html = await (await fetch(`${base}/i/DOG-1`, { headers: { cookie } })).text();
for (const marker of [
  '<span class="agent">scout-1</span>',
  "Claimed. Reproducing the failure first.",
  "Retry implemented; see src/domain/tx.ts.",
  "st st-done",
]) {
  assert(html.includes(marker), `UI missing marker: ${marker}`);
}
const list = await (await fetch(`${base}/p/DOG?f=assignee:scout-1`, { headers: { cookie } })).text();
assert(list.includes("DOG-1"), "filtered list should show scout-1's issue");

for (const c of clients) await c.close();
await server.stop();
conn.close();
rmSync(dir, { recursive: true, force: true });
const runtime = typeof Bun !== "undefined" ? "bun" : "node";
console.log(`dogfood OK (${runtime}): skill loop end-to-end, 2 concurrent agents, UI audit trail verified`);
