import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/connect.js";
import { comments, issues } from "../db/schema.js";
import type { Actor } from "./actor.js";
import { DomainError, notFound } from "./errors.js";

export type Comment = typeof comments.$inferSelect;

export function addComment(db: Db, actor: Actor, issueKey: string, body: string): Comment {
  if (!body.trim()) throw new DomainError("validation", "comment body must not be empty");
  const issue = db.select().from(issues).where(eq(issues.key, issueKey.toUpperCase())).get();
  if (!issue) throw notFound(`issue "${issueKey}"`);
  return db
    .insert(comments)
    .values({
      issueId: issue.id,
      body,
      authorType: actor.type,
      authorTokenId: actor.tokenId ?? null,
      authorName: actor.name,
      createdAt: Date.now(),
    })
    .returning()
    .get();
}

export function listComments(db: Db, issueId: number): Comment[] {
  return db
    .select()
    .from(comments)
    .where(eq(comments.issueId, issueId))
    .orderBy(asc(comments.createdAt), asc(comments.id))
    .all();
}
