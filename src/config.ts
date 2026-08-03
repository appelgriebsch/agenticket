import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";

/** Data directory: AGENTICKET_DATA_DIR override, else env-paths (~/.local/share/agenticket). */
export function resolveDataDir(override?: string): string {
  const dir =
    override ?? process.env.AGENTICKET_DATA_DIR ?? envPaths("agenticket", { suffix: "" }).data;
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function dataPaths(dataDir: string) {
  return {
    db: join(dataDir, "agenticket.db"),
    config: join(dataDir, "config.json"),
    pid: join(dataDir, "agenticket.pid"),
    log: join(dataDir, "agenticket.log"),
  };
}

export function defaultDbPath(): string {
  return dataPaths(resolveDataDir()).db;
}

export interface Config {
  port: number;
  host: string;
}

export const DEFAULTS: Config = { port: 3547, host: "127.0.0.1" };

export const CONFIG_KEYS = ["port", "host"] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

export function isConfigKey(key: string): key is ConfigKey {
  return (CONFIG_KEYS as readonly string[]).includes(key);
}

/** Read config.json; unknown keys are ignored, invalid values rejected. Missing file = {}. */
export function readConfigFile(dataDir: string): Partial<Config> {
  let raw: string;
  try {
    raw = readFileSync(dataPaths(dataDir).config, "utf8");
  } catch {
    return {};
  }
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("config.json must contain a JSON object");
  }
  const out: Partial<Config> = {};
  const obj = parsed as Record<string, unknown>;
  if (obj.port !== undefined) out.port = validatePort(String(obj.port));
  if (obj.host !== undefined) out.host = validateHost(String(obj.host));
  return out;
}

export function writeConfigFile(dataDir: string, config: Partial<Config>): void {
  writeFileSync(dataPaths(dataDir).config, `${JSON.stringify(config, null, 2)}\n`);
}

export function setConfigValue(dataDir: string, key: ConfigKey, value: string): Config[ConfigKey] {
  const current = readConfigFile(dataDir);
  const parsed = key === "port" ? validatePort(value) : validateHost(value);
  writeConfigFile(dataDir, { ...current, [key]: parsed });
  return parsed;
}

export function validatePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`invalid port: ${value}`);
  }
  return port;
}

function validateHost(value: string): string {
  if (value.trim() === "") throw new Error("host cannot be empty");
  return value.trim();
}

/** Effective config: CLI flags > env vars > config.json > defaults. */
export function resolveConfig(
  dataDir: string,
  flags: { port?: string; host?: string } = {},
): Config {
  const file = readConfigFile(dataDir);
  const env: Partial<Config> = {};
  if (process.env.AGENTICKET_PORT) env.port = validatePort(process.env.AGENTICKET_PORT);
  if (process.env.AGENTICKET_HOST) env.host = validateHost(process.env.AGENTICKET_HOST);
  const cli: Partial<Config> = {};
  if (flags.port !== undefined) cli.port = validatePort(flags.port);
  if (flags.host !== undefined) cli.host = validateHost(flags.host);
  return { ...DEFAULTS, ...file, ...env, ...cli };
}
