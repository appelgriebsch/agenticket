import { z } from "zod";

/**
 * Zod schemas for all mutation payloads. Shared between the REST API (phase 2)
 * and the MCP tools (phase 3) so both surfaces validate identically. Objects are
 * strict: unknown keys are rejected, which surfaces agent typos early.
 */

export const loginSchema = z.strictObject({
  password: z.string(),
});

export const projectCreateSchema = z.strictObject({
  key: z.string().min(2).max(10),
  name: z.string().min(1),
  description: z.string().optional(),
});

export const projectPatchSchema = z.strictObject({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

export const labelCreateSchema = z.strictObject({
  name: z.string().min(1),
  color: z.string().optional(),
});

export const issueCreateSchema = z.strictObject({
  project: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(["epic", "issue"]).optional(),
  epic: z.string().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  labels: z.array(z.string()).optional(),
  assignee: z.string().optional(),
  assigneeType: z.enum(["agent", "human"]).optional(),
});

export const issuePatchSchema = z.strictObject({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  epic: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
  assigneeType: z.enum(["agent", "human"]).optional(),
  addLabels: z.array(z.string()).optional(),
  removeLabels: z.array(z.string()).optional(),
});

export const commentCreateSchema = z.strictObject({
  body: z.string().min(1),
});

export const linkSchema = z.strictObject({
  to: z.string().min(1),
  type: z.enum(["blocks", "blocked_by", "depends_on", "relates_to", "duplicates"]),
});

export const tokenCreateSchema = z.strictObject({
  name: z.string().min(1).max(100),
});
