import type { Hono } from "hono";

export interface ServeOptions {
  port: number;
  host: string;
}

export interface RunningServer {
  port: number;
  stop: () => Promise<void>;
}

declare const Bun:
  | { serve: (opts: object) => { port: number; stop: (force?: boolean) => void } }
  | undefined;

/** Start the Hono app on the current runtime (Bun.serve or @hono/node-server). */
export async function serve(app: Hono, opts: ServeOptions): Promise<RunningServer> {
  if (typeof Bun !== "undefined") {
    const server = Bun.serve({ fetch: app.fetch, port: opts.port, hostname: opts.host });
    return {
      port: server.port,
      stop: async () => server.stop(true),
    };
  }
  const { serve: nodeServe } = await import("@hono/node-server");
  return await new Promise((resolve) => {
    const server = nodeServe({ fetch: app.fetch, port: opts.port, hostname: opts.host }, (info) => {
      resolve({
        port: info.port,
        stop: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}
