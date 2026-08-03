import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/connect.js";
import { projects } from "../db/schema.js";
import type { Actor } from "./actor.js";
import { DomainError, notFound } from "./errors.js";

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

export interface ProjectInput {
  key: string;
  name: string;
  description?: string;
}

export type Project = typeof projects.$inferSelect;

export function createProject(db: Db, _actor: Actor, input: ProjectInput): Project {
  const key = input.key.toUpperCase();
  if (!KEY_RE.test(key)) {
    throw new DomainError(
      "validation",
      `invalid project key "${input.key}": must match ${KEY_RE} (e.g. "AGT")`,
    );
  }
  const now = Date.now();
  try {
    return db
      .insert(projects)
      .values({
        key,
        name: input.name,
        description: input.description ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  } catch (err) {
    if (String(err).includes("UNIQUE")) {
      throw new DomainError("conflict", `project key "${key}" already exists`);
    }
    throw err;
  }
}

export function getProject(db: Db, key: string): Project {
  const row = db.select().from(projects).where(eq(projects.key, key.toUpperCase())).get();
  if (!row) throw notFound(`project "${key}"`);
  return row;
}

export function listProjects(db: Db): Project[] {
  return db.select().from(projects).orderBy(asc(projects.key)).all();
}

export function updateProject(
  db: Db,
  _actor: Actor,
  key: string,
  patch: { name?: string; description?: string | null },
): Project {
  const project = getProject(db, key);
  return db
    .update(projects)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      updatedAt: Date.now(),
    })
    .where(eq(projects.id, project.id))
    .returning()
    .get();
}

export function deleteProject(db: Db, _actor: Actor, key: string): void {
  const project = getProject(db, key);
  db.delete(projects).where(eq(projects.id, project.id)).run();
}
