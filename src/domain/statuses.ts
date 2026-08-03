import { isNull } from "drizzle-orm";
import type { Db } from "../db/connect.js";
import { statuses } from "../db/schema.js";
import { DomainError } from "./errors.js";

export type StatusCategory = "todo" | "active" | "done";

export interface StatusDef {
  name: string;
  category: StatusCategory;
  sortOrder: number;
}

/**
 * Status catalog for a project. v1: global rows only (project_id IS NULL); the
 * project-specific overlay slot exists so configurable statuses need no migration.
 */
export function getStatusCatalog(db: Db, _projectId?: number): Map<string, StatusDef> {
  const rows = db.select().from(statuses).where(isNull(statuses.projectId)).all();
  const map = new Map<string, StatusDef>();
  for (const r of rows) {
    map.set(r.name, {
      name: r.name,
      category: r.category as StatusCategory,
      sortOrder: r.sortOrder,
    });
  }
  return map;
}

export function requireStatus(db: Db, name: string, projectId?: number): StatusDef {
  const def = getStatusCatalog(db, projectId).get(name);
  if (!def) {
    const valid = [...getStatusCatalog(db, projectId).keys()].join(", ");
    throw new DomainError("validation", `unknown status "${name}" (valid: ${valid})`);
  }
  return def;
}
