/**
 * Who is performing a mutation. Every domain mutation takes an Actor so audit
 * fields (created_by_token_id, comment authorship) are never skipped.
 */
export interface Actor {
  type: "agent" | "human";
  /** Set when type === "agent": the API token's id. */
  tokenId?: number;
  /** Display name: token name for agents, "admin" (or similar) for humans. */
  name: string;
}

export const SYSTEM_ACTOR: Actor = { type: "human", name: "system" };
