import { Hono } from "hono";
import { createApi } from "./api/routes.js";
import type { Db } from "./db/connect.js";
import { createMcpRoute } from "./mcp/route.js";

export interface AppOptions {
  version: string;
  db: Db;
}

export function createApp(opts: AppOptions): Hono {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true, version: opts.version }));
  app.route("/api/v1", createApi(opts.db));
  app.route("/mcp", createMcpRoute(opts.db));

  return app;
}
