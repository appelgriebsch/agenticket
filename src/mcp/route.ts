import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { authenticateToken } from "../auth/tokens.js";
import type { Db } from "../db/connect.js";
import type { Actor } from "../domain/actor.js";
import { buildMcpServer } from "./server.js";

/**
 * Streamable HTTP MCP endpoint, stateless: a fresh McpServer + transport per
 * request, no session ids. Costs server-initiated notifications, which a
 * tool-only surface doesn't use. Auth runs before the transport ever sees the
 * request: bearer token only (no session cookies — MCP is the agent surface).
 */
export function createMcpRoute(db: Db): Hono {
  const mcp = new Hono();

  mcp.all("/", async (c) => {
    const header = c.req.header("authorization");
    const plaintext = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
    const token = plaintext ? authenticateToken(db, plaintext) : null;
    if (!token) {
      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message:
              "unauthorized: pass an agenticket agent token as `Authorization: Bearer agt_...`",
          },
          id: null,
        },
        401,
      );
    }

    const actor: Actor = { type: "agent", tokenId: token.id, name: token.name };
    const server = buildMcpServer(db, actor);
    const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    return transport.handleRequest(c);
  });

  return mcp;
}
