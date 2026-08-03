import { Command } from "commander";
import { bootstrapAdminPassword } from "../auth/password.js";
import { defaultDbPath } from "../config.js";
import { connect } from "../db/connect.js";
import { migrate } from "../db/migrate.js";
import { serve } from "../serve.js";
import { createApp } from "../server.js";
import { VERSION } from "../version.js";

const program = new Command();

program.name("agenticket").description("Agent-first issue tracker").version(VERSION);

program
  .command("start")
  .description("Start the agenticket server")
  .option("-p, --port <port>", "port to listen on", "3547")
  .option("-H, --host <host>", "address to bind", "127.0.0.1")
  .option("--db <path>", "SQLite database path", defaultDbPath())
  .option("--foreground", "run in the foreground (no daemon)")
  .action(async (opts: { port: string; host: string; db: string; foreground?: boolean }) => {
    const conn = await connect(opts.db);
    migrate(conn.db);
    if (bootstrapAdminPassword(conn.db) === "not-set") {
      console.warn(
        "warning: no admin password configured — set AGENTICKET_ADMIN_PASSWORD to enable human login",
      );
    }
    const app = createApp({ version: VERSION, db: conn.db });
    const running = await serve(app, { port: Number(opts.port), host: opts.host });
    console.log(`agenticket v${VERSION} listening on http://${opts.host}:${running.port}`);

    const shutdown = async () => {
      await running.stop();
      conn.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
