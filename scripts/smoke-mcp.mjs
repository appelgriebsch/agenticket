// Smoke: real MCP client against a live in-process server — the phase-3 scripted
// session (project → epic → issues → block → ready_work → close → unblocked).
// Run under BOTH runtimes: `npx tsx scripts/smoke-mcp.mjs` and `bun scripts/smoke-mcp.mjs`.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createToken } from "../src/auth/tokens.ts";
import { connect } from "../src/db/connect.ts";
import { migrate } from "../src/db/migrate.ts";
import { createApp } from "../src/server.ts";
import { serve } from "../src/serve.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(`smoke-mcp failed: ${msg}`);
}

const dir = mkdtempSync(join(tmpdir(), "agenticket-mcp-smoke-"));
const conn = await connect(join(dir, "smoke.db"));
migrate(conn.db);
const { token } = createToken(conn.db, "smoke-agent");
const server = await serve(createApp({ version: "smoke", db: conn.db }), {
  port: 0,
  host: "127.0.0.1",
});
const url = new URL(`http://127.0.0.1:${server.port}/mcp`);

// 401 without a token.
const unauth = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
});
assert(unauth.status === 401, `expected 401 without token, got ${unauth.status}`);

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  }),
);

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? "";
  if (res.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
}

await call("create_project", { key: "SMK", name: "Smoke" });
const epic = await call("create_issue", { project: "SMK", title: "Epic", kind: "epic" });
assert(epic.key === "SMK-1", `epic key ${epic.key}`);
await call("create_issue", { project: "SMK", title: "A", epic: "SMK-1" });
await call("create_issue", { project: "SMK", title: "B", epic: "SMK-1" });
await call("link_issues", { from: "SMK-2", to: "SMK-3", type: "blocks" });

let ready = await call("ready_work", { project: "SMK" });
assert(
  ready.length === 1 && ready[0].key === "SMK-2",
  `ready before close: ${JSON.stringify(ready.map((r) => r.key))}`,
);

const closed = await call("close_issue", { issue: "SMK-2", comment: "done in smoke" });
assert(closed.unblocked.length === 1 && closed.unblocked[0] === "SMK-3", "unblocked mismatch");

ready = await call("ready_work", { project: "SMK" });
assert(
  ready.length === 1 && ready[0].key === "SMK-3",
  `ready after close: ${JSON.stringify(ready.map((r) => r.key))}`,
);

await client.close();
await server.stop();
conn.close();
rmSync(dir, { recursive: true, force: true });

const runtime = typeof Bun !== "undefined" ? "bun" : "node";
console.log(`smoke-mcp OK (${runtime}): scripted session passed, 401 enforced`);
