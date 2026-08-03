import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/connect.js";
import { issueLabels, labels } from "../db/schema.js";
import { DomainError } from "./errors.js";

export type Label = typeof labels.$inferSelect;

const NAME_RE = /^[a-z0-9][a-z0-9-_.]{0,49}$/;

export function listLabels(db: Db, projectId: number): Label[] {
  return db
    .select()
    .from(labels)
    .where(eq(labels.projectId, projectId))
    .orderBy(asc(labels.name))
    .all();
}

export function createLabel(db: Db, projectId: number, name: string, color?: string): Label {
  validateName(name);
  const existing = db
    .select()
    .from(labels)
    .where(and(eq(labels.projectId, projectId), eq(labels.name, name)))
    .get();
  if (existing) return existing;
  return db
    .insert(labels)
    .values({ projectId, name, color: color ?? null })
    .returning()
    .get();
}

/** Create-if-missing each name and return label ids. */
export function ensureLabels(db: Db, projectId: number, names: string[]): number[] {
  return names.map((n) => createLabel(db, projectId, n).id);
}

export function setIssueLabels(db: Db, issueId: number, labelIds: number[]): void {
  db.delete(issueLabels).where(eq(issueLabels.issueId, issueId)).run();
  for (const labelId of labelIds) {
    db.insert(issueLabels).values({ issueId, labelId }).onConflictDoNothing().run();
  }
}

export function addIssueLabels(db: Db, issueId: number, labelIds: number[]): void {
  for (const labelId of labelIds) {
    db.insert(issueLabels).values({ issueId, labelId }).onConflictDoNothing().run();
  }
}

export function removeIssueLabels(db: Db, issueId: number, labelIds: number[]): void {
  if (labelIds.length === 0) return;
  db.delete(issueLabels)
    .where(and(eq(issueLabels.issueId, issueId), inArray(issueLabels.labelId, labelIds)))
    .run();
}

export function labelsForIssue(db: Db, issueId: number): string[] {
  return db
    .select({ name: labels.name })
    .from(issueLabels)
    .innerJoin(labels, eq(labels.id, issueLabels.labelId))
    .where(eq(issueLabels.issueId, issueId))
    .orderBy(asc(labels.name))
    .all()
    .map((r) => r.name);
}

function validateName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new DomainError(
      "validation",
      `invalid label "${name}": lowercase alphanumeric plus -_. (max 50 chars)`,
    );
  }
}
