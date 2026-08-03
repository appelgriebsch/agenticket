import { and, eq, inArray, or } from "drizzle-orm";
import type { Db } from "../db/connect.js";
import { issueLinks, issues } from "../db/schema.js";
import type { Actor } from "./actor.js";
import { DomainError, notFound } from "./errors.js";
import { getStatusCatalog } from "./statuses.js";

export type StoredLinkType = "blocks" | "depends_on" | "relates_to" | "duplicates";
/** blocked_by is accepted as input sugar and stored inverted as blocks. */
export type LinkType = StoredLinkType | "blocked_by";

const DAG_TYPES: StoredLinkType[] = ["blocks", "depends_on"];

interface IssueRef {
  id: number;
  key: string;
  kind: string;
}

function requireIssue(db: Db, key: string): IssueRef {
  const row = db
    .select({ id: issues.id, key: issues.key, kind: issues.kind })
    .from(issues)
    .where(eq(issues.key, key.toUpperCase()))
    .get();
  if (!row) throw notFound(`issue "${key}"`);
  return row;
}

/** Normalize input: blocked_by(a, b) === blocks(b, a). */
function normalize(
  from: IssueRef,
  to: IssueRef,
  type: LinkType,
): [IssueRef, IssueRef, StoredLinkType] {
  if (type === "blocked_by") return [to, from, "blocks"];
  return [from, to, type];
}

export function linkIssues(
  db: Db,
  actor: Actor,
  fromKey: string,
  toKey: string,
  type: LinkType,
): { from: string; to: string; type: StoredLinkType } {
  const [source, target, storedType] = normalize(
    requireIssue(db, fromKey),
    requireIssue(db, toKey),
    type,
  );
  if (source.id === target.id) {
    throw new DomainError("validation", "an issue cannot be linked to itself");
  }
  if (DAG_TYPES.includes(storedType) && (source.kind === "epic" || target.kind === "epic")) {
    throw new DomainError(
      "validation",
      `epics cannot participate in ${storedType} links; link their child issues instead`,
    );
  }
  if (DAG_TYPES.includes(storedType) && wouldCycle(db, source.id, target.id, storedType)) {
    throw new DomainError(
      "validation",
      `link ${source.key} ${storedType} ${target.key} would create a cycle`,
    );
  }
  try {
    db.insert(issueLinks)
      .values({
        sourceId: source.id,
        targetId: target.id,
        type: storedType,
        createdByTokenId: actor.tokenId ?? null,
        createdAt: Date.now(),
      })
      .run();
  } catch (err) {
    if (String(err).includes("UNIQUE")) {
      throw new DomainError(
        "conflict",
        `link ${source.key} ${storedType} ${target.key} already exists`,
      );
    }
    throw err;
  }
  return { from: source.key, to: target.key, type: storedType };
}

export function unlinkIssues(
  db: Db,
  _actor: Actor,
  fromKey: string,
  toKey: string,
  type: LinkType,
): void {
  const [source, target, storedType] = normalize(
    requireIssue(db, fromKey),
    requireIssue(db, toKey),
    type,
  );
  const res = db
    .delete(issueLinks)
    .where(
      and(
        eq(issueLinks.sourceId, source.id),
        eq(issueLinks.targetId, target.id),
        eq(issueLinks.type, storedType),
      ),
    )
    .run() as { changes?: number };
  if (res.changes === 0) {
    throw notFound(`link ${source.key} ${storedType} ${target.key}`);
  }
}

/** Would adding source→target (of `type`) create a cycle? BFS: can target already reach source? */
function wouldCycle(db: Db, sourceId: number, targetId: number, type: StoredLinkType): boolean {
  const edges = db
    .select({ sourceId: issueLinks.sourceId, targetId: issueLinks.targetId })
    .from(issueLinks)
    .where(eq(issueLinks.type, type))
    .all();
  const adj = new Map<number, number[]>();
  for (const e of edges) {
    const list = adj.get(e.sourceId);
    if (list) list.push(e.targetId);
    else adj.set(e.sourceId, [e.targetId]);
  }
  const queue = [targetId];
  const seen = new Set<number>(queue);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined) break;
    if (cur === sourceId) return true;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

export interface IssueLinkView {
  type: StoredLinkType;
  direction: "out" | "in";
  otherKey: string;
  otherStatus: string;
  otherTitle: string;
}

/** All links touching an issue, with the other side's key/status/title. */
export function linksForIssue(db: Db, issueId: number): IssueLinkView[] {
  const rows = db
    .select({
      type: issueLinks.type,
      sourceId: issueLinks.sourceId,
      targetId: issueLinks.targetId,
      otherKey: issues.key,
      otherStatus: issues.status,
      otherTitle: issues.title,
    })
    .from(issueLinks)
    .innerJoin(
      issues,
      or(
        and(eq(issueLinks.sourceId, issueId), eq(issues.id, issueLinks.targetId)),
        and(eq(issueLinks.targetId, issueId), eq(issues.id, issueLinks.sourceId)),
      ),
    )
    .where(or(eq(issueLinks.sourceId, issueId), eq(issueLinks.targetId, issueId)))
    .all();
  return rows.map((r) => ({
    type: r.type as StoredLinkType,
    direction: r.sourceId === issueId ? "out" : "in",
    otherKey: r.otherKey,
    otherStatus: r.otherStatus,
    otherTitle: r.otherTitle,
  }));
}

/**
 * Map of issueId → keys of its OPEN blockers (issues that block it and whose status
 * category is not 'done'). This is the derived-blocked computation.
 */
export function openBlockersFor(db: Db, issueIds: number[]): Map<number, string[]> {
  const result = new Map<number, string[]>();
  if (issueIds.length === 0) return result;
  const catalog = getStatusCatalog(db);
  const rows = db
    .select({
      blockedId: issueLinks.targetId,
      blockerKey: issues.key,
      blockerStatus: issues.status,
    })
    .from(issueLinks)
    .innerJoin(issues, eq(issues.id, issueLinks.sourceId))
    .where(and(eq(issueLinks.type, "blocks"), inArray(issueLinks.targetId, issueIds)))
    .all();
  for (const r of rows) {
    if (catalog.get(r.blockerStatus)?.category === "done") continue;
    const list = result.get(r.blockedId);
    if (list) list.push(r.blockerKey);
    else result.set(r.blockedId, [r.blockerKey]);
  }
  return result;
}
