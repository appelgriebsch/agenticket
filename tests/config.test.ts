import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULTS,
  readConfigFile,
  resolveConfig,
  setConfigValue,
  validatePort,
} from "../src/config.js";

describe("config", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agenticket-config-"));
    delete process.env.AGENTICKET_PORT;
    delete process.env.AGENTICKET_HOST;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AGENTICKET_PORT;
    delete process.env.AGENTICKET_HOST;
  });

  it("falls back to defaults with no file, env, or flags", () => {
    expect(resolveConfig(dir)).toEqual(DEFAULTS);
  });

  it("reads a missing config file as empty", () => {
    expect(readConfigFile(dir)).toEqual({});
  });

  it("persists values via setConfigValue and round-trips them", () => {
    setConfigValue(dir, "port", "4000");
    setConfigValue(dir, "host", "0.0.0.0");
    expect(readConfigFile(dir)).toEqual({ port: 4000, host: "0.0.0.0" });
    expect(resolveConfig(dir)).toEqual({ port: 4000, host: "0.0.0.0" });
  });

  it("applies precedence: flags > env > config.json > defaults", () => {
    setConfigValue(dir, "port", "4000");
    process.env.AGENTICKET_PORT = "5000";
    expect(resolveConfig(dir).port).toBe(5000);
    expect(resolveConfig(dir, { port: "6000" }).port).toBe(6000);
    // host untouched anywhere → default survives
    expect(resolveConfig(dir).host).toBe(DEFAULTS.host);
  });

  it("rejects invalid ports", () => {
    expect(() => validatePort("abc")).toThrow();
    expect(() => validatePort("70000")).toThrow();
    expect(() => setConfigValue(dir, "port", "-1")).toThrow();
  });
});
