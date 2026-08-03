import { Command } from "commander";
import { bootstrapAdminPassword, setAdminPassword } from "../auth/password.js";
import { createToken, listTokens, revokeToken } from "../auth/tokens.js";
import {
  CONFIG_KEYS,
  type Config,
  dataPaths,
  isConfigKey,
  resolveConfig,
  resolveDataDir,
  setConfigValue,
} from "../config.js";
import { type Connection, connect } from "../db/connect.js";
import { migrate } from "../db/migrate.js";
import { serve } from "../serve.js";
import { createApp } from "../server.js";
import { VERSION } from "../version.js";
import {
  pollHost,
  removePidFile,
  runningAddress,
  runningPid,
  startDaemon,
  stopDaemon,
  writePidFile,
} from "./daemon.js";

const program = new Command();

program
  .name("agenticket")
  .description("Agent-first issue tracker")
  .version(VERSION)
  .option(
    "--data-dir <path>",
    "data directory (default: AGENTICKET_DATA_DIR or ~/.local/share/agenticket)",
  );

function dataDir(): string {
  return resolveDataDir(program.opts().dataDir);
}

/** Open the database with migrations applied (creates the data dir on first run). */
async function openDb(dir: string): Promise<Connection> {
  const conn = await connect(dataPaths(dir).db);
  migrate(conn.db);
  return conn;
}

async function runForeground(dir: string, config: Config): Promise<void> {
  const conn = await openDb(dir);
  const boot = bootstrapAdminPassword(conn.db);
  if (boot === "set-from-env") {
    console.log("admin password set from AGENTICKET_ADMIN_PASSWORD");
  } else if (boot === "not-set") {
    console.warn(
      "warning: no admin password configured — run `agenticket admin set-password` (or set AGENTICKET_ADMIN_PASSWORD) to enable human login",
    );
  }
  const app = createApp({ version: VERSION, db: conn.db });
  const running = await serve(app, { port: config.port, host: config.host });
  writePidFile(dir, { host: config.host, port: running.port });
  console.log(`agenticket v${VERSION} listening on http://${config.host}:${running.port}`);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await running.stop();
    conn.close(); // checkpoints WAL before closing
    removePidFile(dir);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

interface StartFlags {
  port?: string;
  host?: string;
  foreground?: boolean;
}

async function start(flags: StartFlags): Promise<void> {
  const dir = dataDir();
  const config = resolveConfig(dir, flags);
  if (flags.foreground) {
    await runForeground(dir, config);
    return;
  }
  const pid = await startDaemon(dir, config);
  console.log(
    `agenticket v${VERSION} started (pid ${pid}) — http://${pollHost(config.host)}:${config.port}`,
  );
  console.log(`data: ${dir}`);
}

program
  .command("start")
  .description("Start the agenticket server (daemonized unless --foreground)")
  .option("-p, --port <port>", "port to listen on")
  .option("-H, --host <host>", "address to bind")
  .option("--foreground", "run in the foreground (no daemon)")
  .action(start);

program
  .command("stop")
  .description("Stop the running server")
  .action(async () => {
    const pid = await stopDaemon(dataDir());
    console.log(pid === null ? "agenticket is not running" : `stopped (pid ${pid})`);
  });

program
  .command("restart")
  .description("Restart the server")
  .option("-p, --port <port>", "port to listen on")
  .option("-H, --host <host>", "address to bind")
  .action(async (flags: StartFlags) => {
    const pid = await stopDaemon(dataDir());
    if (pid !== null) console.log(`stopped (pid ${pid})`);
    await start(flags);
  });

program
  .command("status")
  .description("Show whether the server is running")
  .action(() => {
    const dir = dataDir();
    const pid = runningPid(dir);
    if (pid === null) {
      console.log("agenticket is not running");
      process.exitCode = 1;
      return;
    }
    const addr = runningAddress(dir) ?? resolveConfig(dir);
    console.log(`agenticket is running (pid ${pid}) — http://${pollHost(addr.host)}:${addr.port}`);
    console.log(`data: ${dir}`);
  });

const configCmd = program.command("config").description("Manage config.json in the data dir");

configCmd
  .command("list")
  .description("Show the effective config (flags > env > config.json > defaults)")
  .action(() => {
    const dir = dataDir();
    const effective = resolveConfig(dir);
    for (const key of CONFIG_KEYS) console.log(`${key}=${effective[key]}`);
  });

configCmd
  .command("get <key>")
  .description(`Get an effective config value (${CONFIG_KEYS.join(", ")})`)
  .action((key: string) => {
    if (!isConfigKey(key))
      throw new Error(`unknown config key "${key}" (${CONFIG_KEYS.join(", ")})`);
    console.log(resolveConfig(dataDir())[key]);
  });

configCmd
  .command("set <key> <value>")
  .description(`Set a config value in config.json (${CONFIG_KEYS.join(", ")})`)
  .action((key: string, value: string) => {
    if (!isConfigKey(key))
      throw new Error(`unknown config key "${key}" (${CONFIG_KEYS.join(", ")})`);
    const dir = dataDir();
    const parsed = setConfigValue(dir, key, value);
    console.log(`${key}=${parsed} written to ${dataPaths(dir).config}`);
    if (runningPid(dir) !== null) console.log("note: restart the server for this to take effect");
  });

const tokenCmd = program.command("token").description("Manage agent bearer tokens");

tokenCmd
  .command("create <name>")
  .description("Create an agent token and print it (shown exactly once)")
  .action(async (name: string) => {
    const conn = await openDb(dataDir());
    try {
      const created = createToken(conn.db, name);
      console.log(created.token);
      console.error(`token "${name}" created — the plaintext above is shown exactly once`);
    } finally {
      conn.close();
    }
  });

tokenCmd
  .command("list")
  .description("List agent tokens")
  .action(async () => {
    const conn = await openDb(dataDir());
    try {
      const rows = listTokens(conn.db);
      if (rows.length === 0) {
        console.log("no tokens");
        return;
      }
      for (const t of rows) {
        const state = t.revokedAt !== null ? "revoked" : "active";
        const lastUsed = t.lastUsedAt === null ? "never" : new Date(t.lastUsedAt).toISOString();
        console.log(
          `${t.name}\t${state}\tcreated ${new Date(t.createdAt).toISOString()}\tlast used ${lastUsed}`,
        );
      }
    } finally {
      conn.close();
    }
  });

tokenCmd
  .command("revoke <name>")
  .description("Revoke an agent token by name")
  .action(async (name: string) => {
    const conn = await openDb(dataDir());
    try {
      const row = listTokens(conn.db).find((t) => t.name === name);
      if (!row) throw new Error(`no token named "${name}"`);
      if (row.revokedAt !== null) {
        console.log(`token "${name}" was already revoked`);
        return;
      }
      revokeToken(conn.db, row.id);
      console.log(`token "${name}" revoked`);
    } finally {
      conn.close();
    }
  });

// Carries piped stdin between promptHidden calls (a single chunk may hold both lines).
let pipedLeftover = "";

/** Prompt on the tty without echoing the typed characters. */
async function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    // piped input (scripts): read one line per call
    let nl = pipedLeftover.indexOf("\n");
    while (nl === -1) {
      const { value, done } = await stdin[Symbol.asyncIterator]().next();
      if (done) break;
      pipedLeftover += value;
      nl = pipedLeftover.indexOf("\n");
    }
    const line = nl === -1 ? pipedLeftover : pipedLeftover.slice(0, nl);
    pipedLeftover = nl === -1 ? "" : pipedLeftover.slice(nl + 1);
    return line.replace(/\r$/, "");
  }
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  return await new Promise<string>((resolve, reject) => {
    let value = "";
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

const adminCmd = program.command("admin").description("Admin account management");

adminCmd
  .command("set-password")
  .description("Set the admin password for the web UI")
  .action(async () => {
    const password = await promptHidden("New admin password: ");
    if (password.length < 8) throw new Error("password must be at least 8 characters");
    const confirm = await promptHidden("Repeat password: ");
    if (password !== confirm) throw new Error("passwords do not match");
    const conn = await openDb(dataDir());
    try {
      setAdminPassword(conn.db, password);
      console.log("admin password updated");
    } finally {
      conn.close();
    }
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
