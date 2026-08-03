import { describe, expect, it } from "vitest";
import { createApp } from "../src/server.js";

describe("createApp", () => {
  it("responds on /healthz", async () => {
    const app = createApp({ version: "0.0.0-test" });
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "0.0.0-test" });
  });
});
