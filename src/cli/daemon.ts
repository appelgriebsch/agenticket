import { spawn } from "node:child_process";
import { openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { type Config, dataPaths } from "../config.js";

/**
 * Pidfile ownership: the foreground server process writes it on boot and removes
 * it on graceful shutdown (see src/cli/index.ts), whether daemonized or run
 * directly with --foreground (e.g. Docker PID 1). The daemon parent only reads it.
 */

/** Line 1: pid. Line 2: host:port actually bound — so `status` reports the truth
 * even when the server was started with flags that differ from config.json. */
export function writePidFile(dataDir: string, config: Config): void {
  writeFileSync(dataPaths(dataDir).pid, `${process.pid}\n${config.host}:${config.port}\n`);
}

/** Bound address recorded in the pidfile, if present. */
export function runningAddress(dataDir: string): { host: string; port: number } | null {
  let raw: string;
  try {
    raw = readFileSync(dataPaths(dataDir).pid, "utf8");
  } catch {
    return null;
  }
  const addr = raw.split("\n")[1]?.trim();
  const sep = addr?.lastIndexOf(":") ?? -1;
  if (!addr || sep === -1) return null;
  const port = Number.parseInt(addr.slice(sep + 1), 10);
  return Number.isInteger(port) ? { host: addr.slice(0, sep), port } : null;
}

export function removePidFile(dataDir: string): void {
  rmSync(dataPaths(dataDir).pid, { force: true });
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Pid from the pidfile if that process is alive; cleans up a stale pidfile. */
export function runningPid(dataDir: string): number | null {
  let raw: string;
  try {
    raw = readFileSync(dataPaths(dataDir).pid, "utf8");
  } catch {
    return null;
  }
  const pid = Number.parseInt(raw.trim(), 10);
  if (Number.isInteger(pid) && pid > 0 && isAlive(pid)) return pid;
  removePidFile(dataDir);
  return null;
}

/** Host to reach the server on locally (wildcard binds are polled via loopback). */
export function pollHost(host: string): string {
  return host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}

async function waitForHealth(url: string, timeoutMs: number, abort?: () => string | null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const reason = abort?.();
    if (reason !== undefined && reason !== null) throw new Error(reason);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not become healthy within ${timeoutMs / 1000}s (${url})`);
}

/**
 * Spawn the server as a detached background process (re-invokes the current
 * runtime + CLI script with --foreground), redirect output to agenticket.log,
 * and wait for /healthz. Returns the child pid.
 */
export async function startDaemon(dataDir: string, config: Config): Promise<number> {
  const existing = runningPid(dataDir);
  if (existing !== null) {
    throw new Error(`agenticket is already running (pid ${existing})`);
  }
  const paths = dataPaths(dataDir);
  const cliScript = process.argv[1];
  if (!cliScript) throw new Error("cannot determine CLI entry script to respawn");
  const logFd = openSync(paths.log, "a");
  const child = spawn(
    process.execPath,
    [
      cliScript,
      "start",
      "--foreground",
      "--data-dir",
      dataDir,
      "--port",
      String(config.port),
      "--host",
      config.host,
    ],
    { detached: true, stdio: ["ignore", logFd, logFd] },
  );
  child.unref();
  const pid = child.pid;
  if (pid === undefined) throw new Error("failed to spawn server process");
  await waitForHealth(`http://${pollHost(config.host)}:${config.port}/healthz`, 10_000, () =>
    isAlive(pid) ? null : `server process exited during startup — see ${paths.log}`,
  );
  return pid;
}

/** SIGTERM the running server and wait for it to exit. */
export async function stopDaemon(dataDir: string, timeoutMs = 10_000): Promise<number | null> {
  const pid = runningPid(dataDir);
  if (pid === null) return null;
  process.kill(pid, "SIGTERM");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) {
      removePidFile(dataDir); // in case the process died before its own cleanup
      return pid;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`pid ${pid} did not exit within ${timeoutMs / 1000}s after SIGTERM`);
}
