import { describe, expect, it } from "vitest";
import { createApp } from "../src/server.js";
import { testDb } from "./helpers.js";

describe("createApp", () => {
  it("responds on /healthz without auth", async () => {
    const conn = await testDb();
    const app = createApp({ version: "0.0.0-test", db: conn.db });
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "0.0.0-test" });
    conn.close();
  });
});
