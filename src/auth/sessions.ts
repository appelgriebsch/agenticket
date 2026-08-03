import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { Db } from "../db/connect.js";
import { sessions } from "../db/schema.js";

export const SESSION_COOKIE = "agenticket_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface Session {
  id: string;
  expiresAt: number;
}

export function createSession(db: Db): Session {
  const now = Date.now();
  const session = {
    id: randomBytes(32).toString("base64url"),
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  db.insert(sessions).values(session).run();
  return { id: session.id, expiresAt: session.expiresAt };
}

/** True if the session exists and has not expired (expired rows are deleted lazily). */
export function validateSession(db: Db, id: string): boolean {
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) return false;
  if (row.expiresAt <= Date.now()) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return false;
  }
  return true;
}

export function deleteSession(db: Db, id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
}

export function purgeExpiredSessions(db: Db): void {
  db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
}
