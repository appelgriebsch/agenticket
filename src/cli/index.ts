import { Command } from "commander";
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
  .option("--foreground", "run in the foreground (no daemon)")
  .action(async (opts: { port: string; host: string; foreground?: boolean }) => {
    const app = createApp({ version: VERSION });
    const running = await serve(app, { port: Number(opts.port), host: opts.host });
    console.log(`agenticket v${VERSION} listening on http://${opts.host}:${running.port}`);
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
