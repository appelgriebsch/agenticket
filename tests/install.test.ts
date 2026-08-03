import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claudeMcpAddArgs,
  codexServerBlock,
  mcpJson,
  runInstall,
  uniqueTokenName,
  upsertTomlSection,
} from "../src/cli/install.js";
import { dataPaths } from "../src/config.js";
import { type Connection, connect } from "../src/db/connect.js";
import { migrate } from "../src/db/migrate.js";
import { serve } from "../src/serve.js";
import { createApp } from "../src/server.js";

const SECTION = "[mcp_servers.agenticket]";
const URL_ = "http://127.0.0.1:3547/mcp";

describe("install helpers", () => {
  it("mcpJson produces a standard mcpServers block", () => {
    const parsed = JSON.parse(mcpJson(URL_, "agt_x"));
    expect(parsed).toEqual({
      mcpServers: {
        agenticket: { type: "http", url: URL_, headers: { Authorization: "Bearer agt_x" } },
      },
    });
  });

  it("claudeMcpAddArgs builds the mcp add invocation", () => {
    expect(claudeMcpAddArgs(URL_, "agt_x")).toEqual([
      "mcp",
      "add",
      "--transport",
      "http",
      "agenticket",
      URL_,
      "--header",
      "Authorization: Bearer agt_x",
    ]);
    expect(claudeMcpAddArgs(URL_, "agt_x", "user").slice(-2)).toEqual(["--scope", "user"]);
  });

  it("uniqueTokenName suffixes taken names", () => {
    expect(uniqueTokenName("codex", new Set())).toBe("codex");
    expect(uniqueTokenName("codex", new Set(["codex", "codex-2"]))).toBe("codex-3");
  });

  it("upsertTomlSection appends to empty and non-empty files", () => {
    const block = codexServerBlock(URL_, "agt_x");
    const empty = upsertTomlSection("", SECTION, block);
    expect(empty.replaced).toBe(false);
    expect(empty.content).toBe(block);

    const existing = 'model = "gpt-5"\n\n[mcp_servers.other]\nurl = "http://x/mcp"\n';
    const appended = upsertTomlSection(existing, SECTION, block);
    expect(appended.replaced).toBe(false);
    expect(appended.content).toBe(`${existing}\n${block}`);
  });

  it("upsertTomlSection replaces only our section, mid-file and at EOF", () => {
    const mid = `a = 1\n\n${SECTION}\nurl = "http://old/mcp"\n\n[mcp_servers.other]\nkeep = true\n`;
    const replacedMid = upsertTomlSection(mid, SECTION, codexServerBlock(URL_, "agt_new"));
    expect(replacedMid.replaced).toBe(true);
    expect(replacedMid.content).not.toContain("http://old/mcp");
    expect(replacedMid.content).toContain('keep = true');
    expect(replacedMid.content).toContain(`Bearer agt_new`);
    expect(replacedMid.content.split(SECTION)).toHaveLength(2);

    const eof = `a = 1\n\n${SECTION}\nurl = "http://old/mcp"\n`;
    const replacedEof = upsertTomlSection(eof, SECTION, codexServerBlock(URL_, "agt_new"));
    expect(replacedEof.content).toContain("a = 1");
    expect(replacedEof.content).not.toContain("http://old/mcp");
  });
});

describe("runInstall", () => {
  let dir: string;
  let logs: string[];

  const deps = {
    dataDir: () => dir,
    openDb: async (d: string): Promise<Connection> => {
      const conn = await connect(dataPaths(d).db);
      migrate(conn.db);
      return conn;
    },
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agt-install-"));
    logs = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      logs.push(String(msg));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("install json prints a config whose token authenticates against /mcp", async () => {
    await runInstall("json", {}, deps);
    const parsed = JSON.parse(logs.join("\n"));
    const server = parsed.mcpServers.agenticket;
    expect(server.url).toBe(URL_);
    const token = server.headers.Authorization.replace("Bearer ", "");
    expect(token).toMatch(/^agt_/);

    const conn = await deps.openDb(dir);
    const running = await serve(createApp({ version: "test", db: conn.db }), {
      port: 0,
      host: "127.0.0.1",
    });
    const client = new Client({ name: "vitest", version: "0.0.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${running.port}/mcp`), {
          requestInit: { headers: { authorization: `Bearer ${token}` } },
        }),
      );
      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);
    } finally {
      await client.close().catch(() => {});
      await running.stop();
      conn.close();
    }
  });

  it("prefers the running server's bound address over config defaults", async () => {
    const { writePidFile } = await import("../src/cli/daemon.js");
    // the test process's own pid counts as "alive"
    writePidFile(dir, { host: "127.0.0.1", port: 3599 });
    await runInstall("json", {}, deps);
    const parsed = JSON.parse(logs.join("\n"));
    expect(parsed.mcpServers.agenticket.url).toBe("http://127.0.0.1:3599/mcp");
  });

  it("install codex writes config.toml and re-running replaces the section", async () => {
    const codexHome = join(dir, "codex-home");
    await runInstall("codex", { url: "http://127.0.0.1:9999/mcp" }, { ...deps, codexHome });
    const file = join(codexHome, "config.toml");
    const first = readFileSync(file, "utf8");
    expect(first).toContain(SECTION);
    expect(first).toContain('url = "http://127.0.0.1:9999/mcp"');

    writeFileSync(file, `${first}\n[mcp_servers.other]\nkeep = true\n`);
    await runInstall("codex", { url: "http://127.0.0.1:8888/mcp" }, { ...deps, codexHome });
    const second = readFileSync(file, "utf8");
    expect(second.split(SECTION)).toHaveLength(2);
    expect(second).toContain('url = "http://127.0.0.1:8888/mcp"');
    expect(second).toContain("keep = true");
  });

  it("install claude falls back to manual instructions when claude is unavailable", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((msg: string) => {
      errors.push(String(msg));
    });
    await runInstall(
      "claude",
      {},
      { ...deps, runClaude: () => ({ ok: false, message: "could not run `claude`" }) },
    );
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toContain("claude mcp add --transport http agenticket");
    expect(errors.join("\n")).toContain("mcpServers");
  });

  it("suffixes the token name when taken and rejects bad targets/scopes", async () => {
    await runInstall("json", {}, deps);
    await runInstall("json", {}, deps);
    const conn = await deps.openDb(dir);
    const { listTokens } = await import("../src/auth/tokens.js");
    const names = listTokens(conn.db).map((t) => t.name);
    conn.close();
    expect(names).toContain("mcp");
    expect(names).toContain("mcp-2");

    await expect(runInstall("cursor", {}, deps)).rejects.toThrow(/unknown install target/);
    await expect(runInstall("json", { scope: "user" }, deps)).rejects.toThrow(/--scope/);
    await expect(runInstall("claude", { scope: "global" }, deps)).rejects.toThrow(
      /invalid --scope/,
    );
  });
});
