import { sql } from "drizzle-orm";
import type { Db } from "./connect.js";
import { migrations } from "./migrations.gen.js";
import { statuses } from "./schema.js";

export const GLOBAL_STATUSES = [
  { name: "open", category: "todo", sortOrder: 0 },
  { name: "in_progress", category: "active", sortOrder: 1 },
  { name: "blocked", category: "active", sortOrder: 2 },
  { name: "in_review", category: "active", sortOrder: 3 },
  { name: "done", category: "done", sortOrder: 4 },
  { name: "cancelled", category: "done", sortOrder: 5 },
] as const;

/** Apply embedded migrations (tracked in _migrations) and seed global statuses. Idempotent. */
export function migrate(db: Db): void {
  db.run(
    sql`CREATE TABLE IF NOT EXISTS _migrations (tag TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`,
  );
  const applied = new Set(
    db.all<{ tag: string }>(sql`SELECT tag FROM _migrations`).map((r) => r.tag),
  );
  for (const m of [...migrations].sort((a, b) => a.idx - b.idx)) {
    if (applied.has(m.tag)) continue;
    db.transaction((tx) => {
      for (const stmt of m.statements) tx.run(sql.raw(stmt));
      tx.run(sql`INSERT INTO _migrations (tag, applied_at) VALUES (${m.tag}, ${Date.now()})`);
    });
  }
  seedGlobalStatuses(db);
}

function seedGlobalStatuses(db: Db): void {
  // NOTE: SQLite treats NULLs as distinct in unique indexes, so ON CONFLICT would not
  // fire for global (project_id IS NULL) rows — check existence explicitly instead.
  const existing = new Set(
    db
      .all<{ name: string }>(sql`SELECT name FROM statuses WHERE project_id IS NULL`)
      .map((r) => r.name),
  );
  for (const s of GLOBAL_STATUSES) {
    if (existing.has(s.name)) continue;
    db.insert(statuses)
      .values({ projectId: null, name: s.name, category: s.category, sortOrder: s.sortOrder })
      .run();
  }
}
