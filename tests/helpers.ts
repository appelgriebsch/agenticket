import { type Connection, connect, type Db } from "../src/db/connect.js";
import { migrate } from "../src/db/migrate.js";
import type { Actor } from "../src/domain/actor.js";

export async function testDb(): Promise<Connection> {
  const conn = await connect(":memory:");
  migrate(conn.db);
  return conn;
}

export const agent: Actor = { type: "agent", tokenId: 1, name: "test-agent" };
export const human: Actor = { type: "human", name: "admin" };

export type { Db };
