import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import type { Db } from "../db/connect.js";
import { issueLabels, issueLinks, issues, labels, projects } from "../db/schema.js";
import type { Actor } from "./actor.js";
import { type Comment, listComments } from "./comments.js";
import { DomainError, notFound } from "./errors.js";
import { addIssueLabels, ensureLabels, labelsForIssue, removeIssueLabels } from "./labels.js";
import { type IssueLinkView, linksForIssue, openBlockersFor } from "./links.js";
import { getProject } from "./projects.js";
import { requireStatus } from "./statuses.js";

export type IssueRow = typeof issues.$inferSelect;
export type IssueKind = "epic" | "issue";

export interface CreateIssueInput {
  project: string;
  title: string;
  description?: string;
  kind?: IssueKind;
  /** Parent epic key (only valid for kind 'issue'). */
  epic?: string;
  priority?: number;
  labels?: string[];
  assignee?: string;
  assigneeType?: "agent" | "human";
}

export interface UpdateIssueInput {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: number;
  /** Epic key, or null to detach from its epic. */
  epic?: string | null;
  assignee?: string | null;
  assigneeType?: "agent" | "human";
  addLabels?: string[];
  removeLabels?: string[];
}

export interface IssueSummary {
  key: string;
  kind: IssueKind;
  title: string;
  status: string;
  priority: number;
  assignee: string | null;
  assigneeType: "agent" | "human" | null;
  epic: string | null;
  labels: string[];
  /** Keys of open issues blocking this one (derived; empty = not blocked by links). */
  blockedBy: string[];
  createdAt: number;
  updatedAt: number;
}

export interface IssueDetail extends IssueSummary {
  project: string;
  description: string | null;
  links: IssueLinkView[];
  comments: Comment[];
  closedAt: number | null;
}

export interface ListIssuesFilter {
  project?: string;
  status?: string[];
  kind?: IssueKind;
  epic?: string;
  assignee?: string;
  labels?: string[];
  text?: string;
  limit?: number;
  offset?: number;
}

function requireIssueRow(db: Db, key: string): IssueRow {
  const row = db.select().from(issues).where(eq(issues.key, key.toUpperCase())).get();
  if (!row) throw notFound(`issue "${key}"`);
  return row;
}

function epicKeyById(db: Db, epicId: number | null): string | null {
  if (epicId === null) return null;
  return (
    db.select({ key: issues.key }).from(issues).where(eq(issues.id, epicId)).get()?.key ?? null
  );
}

function validatePriority(priority: number): void {
  if (!Number.isInteger(priority) || priority < 0 || priority > 4) {
    throw new DomainError("validation", "priority must be an integer 0 (urgent) to 4 (none)");
  }
}

/** Resolve + validate an epic parent for an issue in `projectId`. */
function resolveEpic(db: Db, projectId: number, epicKey: string): IssueRow {
  const epic = requireIssueRow(db, epicKey);
  if (epic.kind !== "epic") {
    throw new DomainError("validation", `"${epic.key}" is not an epic (kind=${epic.kind})`);
  }
  if (epic.projectId !== projectId) {
    throw new DomainError("validation", `epic "${epic.key}" belongs to a different project`);
  }
  return epic;
}

export function createIssue(db: Db, actor: Actor, input: CreateIssueInput): IssueDetail {
  const project = getProject(db, input.project);
  const kind: IssueKind = input.kind ?? "issue";
  const priority = input.priority ?? 2;
  validatePriority(priority);
  if (!input.title.trim()) throw new DomainError("validation", "title must not be empty");
  if (input.epic && kind === "epic") {
    throw new DomainError("validation", "an epic cannot belong to another epic");
  }
  const epicId = input.epic ? resolveEpic(db, project.id, input.epic).id : null;
  const now = Date.now();

  const row = db.transaction((tx) => {
    // Atomic per-project number allocation.
    const alloc = tx
      .update(projects)
      .set({ nextIssueNumber: sql`${projects.nextIssueNumber} + 1`, updatedAt: now })
      .where(eq(projects.id, project.id))
      .returning({ next: projects.nextIssueNumber })
      .get();
    if (!alloc) throw notFound(`project "${project.key}"`);
    const number = alloc.next - 1;
    const created = tx
      .insert(issues)
      .values({
        projectId: project.id,
        number,
        key: `${project.key}-${number}`,
        kind,
        epicId,
        title: input.title,
        description: input.description ?? null,
        status: "open",
        priority,
        assignee: input.assignee ?? null,
        assigneeType: input.assignee ? (input.assigneeType ?? actor.type) : null,
        createdByTokenId: actor.tokenId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    if (input.labels?.length) {
      addIssueLabels(
        tx as unknown as Db,
        created.id,
        ensureLabels(tx as unknown as Db, project.id, input.labels),
      );
    }
    return created;
  });
  return getIssue(db, row.key);
}

export function getIssue(db: Db, key: string): IssueDetail {
  const row = requireIssueRow(db, key);
  const project = db.select().from(projects).where(eq(projects.id, row.projectId)).get();
  return {
    key: row.key,
    project: project?.key ?? "?",
    kind: row.kind as IssueKind,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    assigneeType: row.assigneeType as "agent" | "human" | null,
    epic: epicKeyById(db, row.epicId),
    labels: labelsForIssue(db, row.id),
    blockedBy: openBlockersFor(db, [row.id]).get(row.id) ?? [],
    links: linksForIssue(db, row.id),
    comments: listComments(db, row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
  };
}

export function updateIssue(
  db: Db,
  actor: Actor,
  key: string,
  patch: UpdateIssueInput,
): IssueDetail {
  const row = requireIssueRow(db, key);
  const changes: Partial<typeof issues.$inferInsert> = {};

  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new DomainError("validation", "title must not be empty");
    changes.title = patch.title;
  }
  if (patch.description !== undefined) changes.description = patch.description;
  if (patch.priority !== undefined) {
    validatePriority(patch.priority);
    changes.priority = patch.priority;
  }
  if (patch.status !== undefined && patch.status !== row.status) {
    const def = requireStatus(db, patch.status, row.projectId);
    changes.status = patch.status;
    changes.closedAt = def.category === "done" ? Date.now() : null;
  }
  if (patch.epic !== undefined) {
    if (patch.epic === null) {
      changes.epicId = null;
    } else {
      if (row.kind === "epic") {
        throw new DomainError("validation", "an epic cannot belong to another epic");
      }
      changes.epicId = resolveEpic(db, row.projectId, patch.epic).id;
    }
  }
  if (patch.assignee !== undefined) {
    changes.assignee = patch.assignee;
    changes.assigneeType = patch.assignee === null ? null : (patch.assigneeType ?? actor.type);
  }

  if (Object.keys(changes).length > 0) {
    changes.updatedAt = Date.now();
    db.update(issues).set(changes).where(eq(issues.id, row.id)).run();
  }
  if (patch.addLabels?.length) {
    addIssueLabels(db, row.id, ensureLabels(db, row.projectId, patch.addLabels));
  }
  if (patch.removeLabels?.length) {
    const existing = db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.projectId, row.projectId), inArray(labels.name, patch.removeLabels)))
      .all();
    removeIssueLabels(
      db,
      row.id,
      existing.map((l) => l.id),
    );
  }
  return getIssue(db, row.key);
}

export interface CloseResult {
  issue: IssueDetail;
  /** Issues that had this one as their only remaining open blocker. */
  unblocked: string[];
}

export function closeIssue(
  db: Db,
  actor: Actor,
  key: string,
  status: "done" | "cancelled" = "done",
): CloseResult {
  const row = requireIssueRow(db, key);
  // Issues this one blocks, BEFORE closing: candidates for becoming unblocked.
  const candidates = db
    .select({ id: issues.id, key: issues.key })
    .from(issueLinks)
    .innerJoin(issues, eq(issues.id, issueLinks.targetId))
    .where(and(eq(issueLinks.type, "blocks"), eq(issueLinks.sourceId, row.id)))
    .all();
  const updated = updateIssue(db, actor, key, { status });
  const stillBlocked = openBlockersFor(
    db,
    candidates.map((c) => c.id),
  );
  const unblocked = candidates
    .filter((c) => (stillBlocked.get(c.id) ?? []).length === 0)
    .map((c) => c.key);
  return { issue: updated, unblocked };
}

export function deleteIssue(db: Db, _actor: Actor, key: string): void {
  const row = requireIssueRow(db, key);
  if (row.kind === "epic") {
    db.update(issues).set({ epicId: null }).where(eq(issues.epicId, row.id)).run();
  }
  db.delete(issues).where(eq(issues.id, row.id)).run();
}

export function listIssues(db: Db, filter: ListIssuesFilter = {}): IssueSummary[] {
  const conds = [];
  let projectId: number | undefined;
  if (filter.project) {
    projectId = getProject(db, filter.project).id;
    conds.push(eq(issues.projectId, projectId));
  }
  if (filter.status?.length) conds.push(inArray(issues.status, filter.status));
  if (filter.kind) conds.push(eq(issues.kind, filter.kind));
  if (filter.epic) {
    const epic = requireIssueRow(db, filter.epic);
    conds.push(eq(issues.epicId, epic.id));
  }
  if (filter.assignee) conds.push(eq(issues.assignee, filter.assignee));
  if (filter.text) {
    const pat = `%${filter.text}%`;
    conds.push(or(like(issues.title, pat), like(issues.description, pat)));
  }
  if (filter.labels?.length) {
    const sub = db
      .select({ issueId: issueLabels.issueId })
      .from(issueLabels)
      .innerJoin(labels, eq(labels.id, issueLabels.labelId))
      .where(inArray(labels.name, filter.labels));
    conds.push(inArray(issues.id, sub));
  }

  const rows = db
    .select()
    .from(issues)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(issues.priority), desc(issues.createdAt))
    .limit(filter.limit ?? 50)
    .offset(filter.offset ?? 0)
    .all();

  const blockers = openBlockersFor(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toSummary(db, r, blockers.get(r.id) ?? []));
}

export function toSummary(db: Db, r: IssueRow, blockedBy: string[]): IssueSummary {
  return {
    key: r.key,
    kind: r.kind as IssueKind,
    title: r.title,
    status: r.status,
    priority: r.priority,
    assignee: r.assignee,
    assigneeType: r.assigneeType as "agent" | "human" | null,
    epic: epicKeyById(db, r.epicId),
    labels: labelsForIssue(db, r.id),
    blockedBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
