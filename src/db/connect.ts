import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "./schema.js";

/** Runtime-agnostic sync Drizzle database (better-sqlite3 on Node, bun:sqlite on Bun). */
// biome-ignore lint/suspicious/noExplicitAny: run-result type differs per driver
export type Db = BaseSQLiteDatabase<"sync", any, typeof schema>;

export interface Connection {
  db: Db;
  /** Checkpoint WAL and close the underlying handle. */
  close: () => void;
}

declare const Bun: object | undefined;

const PRAGMAS = [
  "journal_mode = WAL",
  "busy_timeout = 5000",
  "foreign_keys = ON",
  "synchronous = NORMAL",
];

/**
 * Open (or create) the SQLite database at `path` (":memory:" supported).
 *
 * IMPORTANT: drivers are loaded via dynamic import only. A static import of
 * better-sqlite3 anywhere in the codebase breaks `bunx` (Bun skips its
 * postinstall, so the native binary does not exist under Bun).
 */
export async function connect(path: string): Promise<Connection> {
  if (typeof Bun !== "undefined") {
    const { Database } = await import("bun:sqlite");
    const { drizzle } = await import("drizzle-orm/bun-sqlite");
    const sqlite = new Database(path, { create: true });
    for (const p of PRAGMAS) sqlite.exec(`PRAGMA ${p};`);
    return {
      db: drizzle(sqlite, { schema }) as unknown as Db,
      close: () => {
        sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);");
        sqlite.close();
      },
    };
  }
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const sqlite = new Database(path);
  for (const p of PRAGMAS) sqlite.pragma(p);
  return {
    db: drizzle(sqlite, { schema }) as unknown as Db,
    close: () => {
      sqlite.pragma("wal_checkpoint(TRUNCATE)");
      sqlite.close();
    },
  };
}
