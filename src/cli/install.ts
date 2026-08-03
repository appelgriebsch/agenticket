import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Command } from "commander";
import { createToken, listTokens } from "../auth/tokens.js";
import { resolveConfig } from "../config.js";
import type { Connection, Db } from "../db/connect.js";
import { pollHost, runningAddress, runningPid } from "./daemon.js";

export const INSTALL_TARGETS = ["claude", "codex", "json"] as const;
export type InstallTarget = (typeof INSTALL_TARGETS)[number];

const DEFAULT_TOKEN_NAMES: Record<InstallTarget, string> = {
  claude: "claude-code",
  codex: "codex",
  json: "mcp",
};

const CLAUDE_SCOPES = ["local", "user", "project"] as const;
const CODEX_SECTION = "[mcp_servers.agenticket]";

/** mcpServers JSON block accepted by most MCP clients (.mcp.json etc.). */
export function mcpJson(url: string, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        agenticket: {
          type: "http",
          url,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

/** TOML section for ~/.codex/config.toml (codex mcp add can't set auth headers). */
export function codexServerBlock(url: string, token: string): string {
  return `${CODEX_SECTION}\nurl = "${url}"\nhttp_headers = { "Authorization" = "Bearer ${token}" }\n`;
}

/**
 * Replace the section starting at `header` (up to the next `[...]` header or EOF)
 * with `block`, or append `block` if the section doesn't exist. Textual on
 * purpose: we only ever touch our own section and leave the rest byte-identical.
 */
export function upsertTomlSection(
  content: string,
  header: string,
  block: string,
): { content: string; replaced: boolean } {
  const blockLines = block.replace(/\n$/, "").split("\n");
  const lines = content.split("\n");
  const start = lines.findIndex((l) => l.trim() === header);
  if (start === -1) {
    const sep = content === "" ? "" : content.endsWith("\n") ? "\n" : "\n\n";
    return { content: `${content}${sep}${blockLines.join("\n")}\n`, replaced: false };
  }
  let end = start + 1;
  while (end < lines.length && !(lines[end] ?? "").trim().startsWith("[")) end++;
  // keep one blank line before a following section
  if (end < lines.length) blockLines.push("");
  return {
    content: [...lines.slice(0, start), ...blockLines, ...lines.slice(end)].join("\n"),
    replaced: true,
  };
}

export function claudeMcpAddArgs(url: string, token: string, scope?: string): string[] {
  const args = [
    "mcp",
    "add",
    "--transport",
    "http",
    "agenticket",
    url,
    "--header",
    `Authorization: Bearer ${token}`,
  ];
  if (scope) args.push("--scope", scope);
  return args;
}

/** Token names are unique — suffix -2, -3, … until free. */
export function uniqueTokenName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function shellQuote(arg: string): string {
  return /[^A-Za-z0-9_@%+=:,./-]/.test(arg) ? `'${arg.replace(/'/g, "'\\''")}'` : arg;
}

export interface InstallOptions {
  name?: string;
  url?: string;
  scope?: string;
}

export interface InstallDeps {
  dataDir: () => string;
  openDb: (dir: string) => Promise<Connection>;
  /** Overridable in tests. */
  codexHome?: string;
  runClaude?: (args: string[]) => { ok: boolean; message: string };
}

function defaultRunClaude(args: string[]): { ok: boolean; message: string } {
  const res = spawnSync("claude", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (res.error)
    return { ok: false, message: "could not run `claude` — is Claude Code installed?" };
  if (res.status !== 0)
    return { ok: false, message: `\`claude mcp add\` exited with ${res.status}` };
  return { ok: true, message: "" };
}

function mintToken(db: Db, requested: string): { name: string; token: string } {
  const taken = new Set(listTokens(db).map((t) => t.name));
  const name = uniqueTokenName(requested, taken);
  return { name, token: createToken(db, name).token };
}

export async function runInstall(
  target: string,
  opts: InstallOptions,
  deps: InstallDeps,
): Promise<void> {
  if (!(INSTALL_TARGETS as readonly string[]).includes(target))
    throw new Error(`unknown install target "${target}" (${INSTALL_TARGETS.join(", ")})`);
  if (opts.scope !== undefined) {
    if (target !== "claude") throw new Error("--scope only applies to `install claude`");
    if (!(CLAUDE_SCOPES as readonly string[]).includes(opts.scope))
      throw new Error(`invalid --scope "${opts.scope}" (${CLAUDE_SCOPES.join(", ")})`);
  }

  const dir = deps.dataDir();
  // prefer the running server's actually-bound address (pidfile line 2) over
  // config/defaults — `start -p 3599` isn't persisted to config.json
  const pid = runningPid(dir);
  const addr = (pid !== null ? runningAddress(dir) : null) ?? resolveConfig(dir);
  const url = opts.url ?? `http://${pollHost(addr.host)}:${addr.port}/mcp`;

  const conn = await deps.openDb(dir);
  let minted: { name: string; token: string };
  try {
    minted = mintToken(conn.db, opts.name ?? DEFAULT_TOKEN_NAMES[target as InstallTarget]);
  } finally {
    conn.close();
  }
  // stderr for human notes so `install json` stays pipeable
  console.error(`token "${minted.name}" created (plaintext stored only in the client config)`);
  if (pid === null)
    console.error("note: agenticket is not running — start it with `npx agenticket start`");

  switch (target as InstallTarget) {
    case "json":
      console.log(mcpJson(url, minted.token));
      break;
    case "codex": {
      const codexDir = deps.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");
      const file = join(codexDir, "config.toml");
      mkdirSync(dirname(file), { recursive: true });
      const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
      const result = upsertTomlSection(
        existing,
        CODEX_SECTION,
        codexServerBlock(url, minted.token),
      );
      writeFileSync(file, result.content);
      console.log(
        `${result.replaced ? "updated" : "added"} ${CODEX_SECTION} in ${file} — restart Codex to pick it up`,
      );
      break;
    }
    case "claude": {
      const args = claudeMcpAddArgs(url, minted.token, opts.scope);
      const run = deps.runClaude ?? defaultRunClaude;
      const res = run(args);
      if (!res.ok) {
        console.error(res.message);
        console.error("add it manually:");
        console.error(`  claude ${args.map(shellQuote).join(" ")}`);
        console.error("or paste this into your .mcp.json:");
        console.error(mcpJson(url, minted.token));
        process.exitCode = 1;
        return;
      }
      console.log(`agenticket MCP server added to Claude Code (token "${minted.name}")`);
      break;
    }
  }
}

export function registerInstallCommand(program: Command, deps: InstallDeps): void {
  program
    .command("install <target>")
    .description("Connect a coding agent: mint a token and configure it (claude | codex | json)")
    .option("--name <name>", "token name (default: named after the target)")
    .option("--url <url>", "MCP endpoint URL (default: from the effective config)")
    .option("--scope <scope>", "claude only: local | user | project (passed to claude mcp add)")
    .action((target: string, opts: InstallOptions) => runInstall(target, opts, deps));
}
