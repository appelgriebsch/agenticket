import { mkdirSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";

/** Data directory: AGENTICKET_DATA_DIR override, else env-paths (~/.local/share/agenticket). */
export function resolveDataDir(): string {
  const dir = process.env.AGENTICKET_DATA_DIR ?? envPaths("agenticket", { suffix: "" }).data;
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function defaultDbPath(): string {
  return join(resolveDataDir(), "agenticket.db");
}
