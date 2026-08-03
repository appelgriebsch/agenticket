import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE, validateSession } from "../auth/sessions.js";
import { authenticateToken } from "../auth/tokens.js";
import type { Db } from "../db/connect.js";
import type { Actor } from "../domain/actor.js";

export type ApiEnv = { Variables: { actor: Actor } };

export function unauthorized(c: Context, message = "authentication required"): Response {
  return c.json({ error: { code: "unauthorized", message } }, 401);
}

export function forbidden(c: Context, message = "admin session required"): Response {
  return c.json({ error: { code: "forbidden", message } }, 403);
}

/**
 * Accepts EITHER a valid session cookie (actor = human "admin") OR an
 * `Authorization: Bearer agt_...` token (actor = agent with the token's name).
 */
export function authMiddleware(db: Db): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const header = c.req.header("authorization");
    if (header?.toLowerCase().startsWith("bearer ")) {
      const token = authenticateToken(db, header.slice(7).trim());
      if (!token) return unauthorized(c, "invalid or revoked token");
      c.set("actor", { type: "agent", tokenId: token.id, name: token.name });
      return next();
    }
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (sessionId && validateSession(db, sessionId)) {
      c.set("actor", { type: "human", name: "admin" });
      return next();
    }
    return unauthorized(c);
  };
}

/** Guard for admin-only routes (token management, destructive deletes). */
export const requireAdmin: MiddlewareHandler<ApiEnv> = async (c, next) => {
  if (c.get("actor").type !== "human") return forbidden(c);
  return next();
};
