import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/connect.js";
import { settings } from "../db/schema.js";

const ADMIN_HASH_KEY = "admin_password_hash";
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 32;

/** Format: scrypt:<salt b64url>:<hash b64url>. node:crypto scrypt works on Bun too. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS);
  return `scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split(":");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64url"), KEY_LEN, SCRYPT_PARAMS);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hasAdminPassword(db: Db): boolean {
  return db.select().from(settings).where(eq(settings.key, ADMIN_HASH_KEY)).get() !== undefined;
}

export function setAdminPassword(db: Db, password: string): void {
  const value = hashPassword(password);
  db.insert(settings)
    .values({ key: ADMIN_HASH_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export function verifyAdminPassword(db: Db, password: string): boolean {
  const row = db.select().from(settings).where(eq(settings.key, ADMIN_HASH_KEY)).get();
  return row !== undefined && verifyPassword(password, row.value);
}

/**
 * First-run bootstrap: if no admin password is stored and AGENTICKET_ADMIN_PASSWORD
 * is set, hash and store it. Returns what happened so the caller can log it.
 */
export function bootstrapAdminPassword(db: Db): "already-set" | "set-from-env" | "not-set" {
  if (hasAdminPassword(db)) return "already-set";
  const fromEnv = process.env.AGENTICKET_ADMIN_PASSWORD;
  if (!fromEnv) return "not-set";
  setAdminPassword(db, fromEnv);
  return "set-from-env";
}
