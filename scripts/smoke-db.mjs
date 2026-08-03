// Smoke: fresh file db → migrate → WAL confirmed → create project/issue → ready_work.
// Run under BOTH runtimes: `npx tsx scripts/smoke-db.mjs` (Node; plain `node` cannot
// remap the .js specifiers inside our .ts files) and `bun scripts/smoke-db.mjs`.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { connect } from "../src/db/connect.ts";
import { migrate } from "../src/db/migrate.ts";
import { createIssue, createProject, readyWork } from "../src/domain/index.ts";

const dir = mkdtempSync(join(tmpdir(), "agenticket-smoke-"));
const conn = await connect(join(dir, "smoke.db"));
migrate(conn.db);
migrate(conn.db); // idempotency check

const [{ journal_mode }] = conn.db.all(sql`PRAGMA journal_mode`);
if (journal_mode !== "wal") throw new Error(`expected WAL, got ${journal_mode}`);

const human = { type: "human", name: "smoke" };
createProject(conn.db, human, { key: "SMK", name: "Smoke" });
const issue = createIssue(conn.db, human, { project: "SMK", title: "hello" });
const ready = readyWork(conn.db);
conn.close();
rmSync(dir, { recursive: true, force: true });

if (issue.key !== "SMK-1" || ready.length !== 1) throw new Error("smoke failed");
const runtime = typeof Bun !== "undefined" ? "bun" : "node";
console.log(`smoke OK (${runtime}): ${issue.key} created, WAL on, ready=${ready.length}`);
