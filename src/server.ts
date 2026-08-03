import { Hono } from "hono";

export interface AppOptions {
  version: string;
}

export function createApp(opts: AppOptions): Hono {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true, version: opts.version }));

  return app;
}
