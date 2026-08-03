import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/connect.js";
import { issues } from "../db/schema.js";
import { type IssueSummary, toSummary } from "./issues.js";
import { openBlockersFor } from "./links.js";
import { getProject } from "./projects.js";
import { getStatusCatalog } from "./statuses.js";

export interface ReadyWorkFilter {
  project?: string;
  assignee?: string;
  limit?: number;
}

/**
 * The "what should I pick up next" query: issues (not epics) that are not closed,
 * not manually marked blocked (external blocker), and have no open blocking issues.
 * Ordered by priority (0 = urgent first), then oldest first.
 */
export function readyWork(db: Db, filter: ReadyWorkFilter = {}): IssueSummary[] {
  const catalog = getStatusCatalog(db);
  const openStatuses = [...catalog.values()]
    .filter((s) => s.category !== "done" && s.name !== "blocked")
    .map((s) => s.name);

  const conds = [eq(issues.kind, "issue"), inArray(issues.status, openStatuses)];
  if (filter.project) conds.push(eq(issues.projectId, getProject(db, filter.project).id));
  if (filter.assignee) conds.push(eq(issues.assignee, filter.assignee));

  const rows = db
    .select()
    .from(issues)
    .where(and(...conds))
    .orderBy(asc(issues.priority), asc(issues.createdAt))
    .all();

  const blockers = openBlockersFor(
    db,
    rows.map((r) => r.id),
  );
  const ready = rows.filter((r) => (blockers.get(r.id) ?? []).length === 0);
  return ready.slice(0, filter.limit ?? 20).map((r) => toSummary(db, r, []));
}
