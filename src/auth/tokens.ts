import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/connect.js";
import { tokens } from "../db/schema.js";
import { DomainError, notFound } from "../domain/errors.js";

const LAST_USED_THROTTLE_MS = 60_000;

export interface TokenInfo {
  id: number;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export interface CreatedToken extends TokenInfo {
  /** Plaintext token — shown exactly once, only the sha256 hash is stored. */
  token: string;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function createToken(db: Db, name: string): CreatedToken {
  const plaintext = `agt_${randomBytes(32).toString("base64url")}`;
  try {
    const row = db
      .insert(tokens)
      .values({ name, tokenHash: sha256(plaintext), createdAt: Date.now() })
      .returning()
      .get();
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      lastUsedAt: null,
      revokedAt: null,
      token: plaintext,
    };
  } catch (err) {
    if (String(err).includes("UNIQUE")) {
      throw new DomainError("conflict", `token name "${name}" already exists`);
    }
    throw err;
  }
}

/**
 * Look up a bearer token by plaintext. Returns null for unknown or revoked tokens.
 * Touches last_used_at at most once per minute to avoid a write on every request.
 */
export function authenticateToken(db: Db, plaintext: string): TokenInfo | null {
  const row = db
    .select()
    .from(tokens)
    .where(eq(tokens.tokenHash, sha256(plaintext)))
    .get();
  if (!row || row.revokedAt !== null) return null;
  const now = Date.now();
  if (row.lastUsedAt === null || now - row.lastUsedAt > LAST_USED_THROTTLE_MS) {
    db.update(tokens).set({ lastUsedAt: now }).where(eq(tokens.id, row.id)).run();
    row.lastUsedAt = now;
  }
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}

export function listTokens(db: Db): TokenInfo[] {
  return db
    .select({
      id: tokens.id,
      name: tokens.name,
      createdAt: tokens.createdAt,
      lastUsedAt: tokens.lastUsedAt,
      revokedAt: tokens.revokedAt,
    })
    .from(tokens)
    .all();
}

/** Revoke (not delete) so audit references to the token id stay resolvable. */
export function revokeToken(db: Db, id: number): void {
  const row = db.select().from(tokens).where(eq(tokens.id, id)).get();
  if (!row) throw notFound(`token ${id}`);
  if (row.revokedAt === null) {
    db.update(tokens).set({ revokedAt: Date.now() }).where(eq(tokens.id, id)).run();
  }
}
