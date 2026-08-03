import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli/index.ts", "src/server.ts"],
  format: "esm",
  platform: "node",
  dts: false,
  clean: true,
  outExtensions: () => ({ js: ".js" }),
  deps: {
    // Native/runtime-specific drivers must never be bundled:
    // better-sqlite3 is Node-only (native addon), bun:sqlite is Bun-only.
    neverBundle: ["better-sqlite3", "bun:sqlite"],
  },
});
