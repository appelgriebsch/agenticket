import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Db } from "../db/connect.js";
import {
  type Actor,
  addComment,
  closeIssue,
  createIssue,
  createProject,
  DomainError,
  getIssue,
  issueCreateSchema,
  issuePatchSchema,
  linkIssues,
  linkSchema,
  listIssues,
  listProjects,
  projectCreateSchema,
  readyWork,
  unlinkIssues,
  updateIssue,
} from "../domain/index.js";
import { VERSION } from "../version.js";

/**
 * Agent-facing MCP tool surface. One fresh McpServer per request (stateless):
 * cheap to build (tool registration only), and the actor is baked in at
 * construction so audit fields are always stamped.
 *
 * No delete tools on purpose — agents can close/cancel but never destroy the
 * audit trail; destructive deletes stay behind the human admin surface.
 */

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Convert DomainErrors into tool errors with a discovery hint appended. */
function run(fn: () => unknown): CallToolResult {
  try {
    return ok(fn());
  } catch (err) {
    if (err instanceof DomainError) {
      const hint =
        err.code === "not_found"
          ? " (keys are case-insensitive like AGT-42; use list_projects or list_issues to discover valid keys)"
          : "";
      return fail(`${err.message}${hint}`);
    }
    throw err;
  }
}

// Shared field schemas with agent-facing descriptions. Validation constraints
// come from src/domain/schemas.ts so MCP and REST accept identical payloads.
const issueKeyParam = z
  .string()
  .min(1)
  .describe('Issue key, e.g. "AGT-42" (case-insensitive). Never a numeric id.');
const projectKeyParam = z.string().min(1).describe('Project key, e.g. "AGT".');
const priorityParam = issueCreateSchema.shape.priority.describe(
  "0=urgent, 1=high, 2=normal (default), 3=low, 4=none.",
);

export function buildMcpServer(db: Db, actor: Actor): McpServer {
  const server = new McpServer({ name: "agenticket", version: VERSION });

  server.registerTool(
    "list_projects",
    {
      description:
        "List all projects (key, name, description). Call this first to discover project keys.",
      inputSchema: {},
    },
    () =>
      run(() =>
        listProjects(db).map((p) => ({ key: p.key, name: p.name, description: p.description })),
      ),
  );

  server.registerTool(
    "create_project",
    {
      description:
        'Create a project. The key becomes the issue-key prefix (project "AGT" numbers issues AGT-1, AGT-2, ...).',
      inputSchema: {
        key: projectCreateSchema.shape.key.describe(
          'Short uppercase identifier, 2-10 chars, letters/digits, starting with a letter, e.g. "AGT".',
        ),
        name: projectCreateSchema.shape.name.describe("Human-readable project name."),
        description: projectCreateSchema.shape.description.describe(
          "Optional longer description of what the project covers.",
        ),
      },
    },
    (args) =>
      run(() => {
        const p = createProject(db, actor, args);
        return { key: p.key, name: p.name, description: p.description };
      }),
  );

  server.registerTool(
    "create_issue",
    {
      description:
        'Create an issue or epic in a project. Returns the full issue including its assigned key (e.g. "AGT-7"). Epics group issues: create the epic first, then pass its key as `epic` when creating child issues.',
      inputSchema: {
        project: projectKeyParam,
        title: issueCreateSchema.shape.title.describe("One-line summary."),
        description: issueCreateSchema.shape.description.describe(
          "Longer body: context, acceptance criteria, links.",
        ),
        kind: issueCreateSchema.shape.kind.describe(
          '"issue" (default) or "epic". Epics are containers; they cannot have blocking links or a parent epic.',
        ),
        epic: issueCreateSchema.shape.epic.describe(
          "Key of the parent epic to file this issue under (issues only).",
        ),
        priority: priorityParam,
        labels: issueCreateSchema.shape.labels.describe(
          "Label names; created in the project on first use.",
        ),
        assignee: issueCreateSchema.shape.assignee.describe(
          "Who should work on it (agent or human name).",
        ),
      },
    },
    (args) => run(() => createIssue(db, actor, args)),
  );

  server.registerTool(
    "get_issue",
    {
      description:
        "Fetch one issue by key: full detail plus comments, links, and the computed blockedBy list (open issues blocking it).",
      inputSchema: { key: issueKeyParam },
    },
    (args) => run(() => getIssue(db, args.key)),
  );

  server.registerTool(
    "update_issue",
    {
      description:
        "Update fields on an issue. Only provided fields change. To close an issue prefer close_issue (it reports which issues become unblocked).",
      inputSchema: {
        key: issueKeyParam,
        title: issuePatchSchema.shape.title.describe("New title."),
        description: issuePatchSchema.shape.description.describe(
          "New description (null clears it).",
        ),
        status: issuePatchSchema.shape.status.describe(
          "One of: open, in_progress, blocked, in_review, done, cancelled. Use `blocked` only for external blockers — blocking by another issue is derived from links automatically.",
        ),
        priority: priorityParam,
        epic: issuePatchSchema.shape.epic.describe(
          "Key of the epic to move this issue under, or null to detach.",
        ),
        assignee: issuePatchSchema.shape.assignee.describe("New assignee, or null to unassign."),
        add_labels: z.array(z.string()).optional().describe("Label names to add."),
        remove_labels: z.array(z.string()).optional().describe("Label names to remove."),
      },
    },
    ({ key, add_labels, remove_labels, ...patch }) =>
      run(() =>
        updateIssue(db, actor, key, {
          ...patch,
          addLabels: add_labels,
          removeLabels: remove_labels,
        }),
      ),
  );

  server.registerTool(
    "list_issues",
    {
      description:
        "Search/filter issues; returns compact rows (key, title, status, priority, assignee, epic, labels, blockedBy). All filters are ANDed.",
      inputSchema: {
        project: projectKeyParam.optional(),
        status: z
          .array(z.string())
          .optional()
          .describe('Only these statuses, e.g. ["open", "in_progress"].'),
        kind: issueCreateSchema.shape.kind.describe('Only "issue" or only "epic".'),
        epic: issueCreateSchema.shape.epic.describe("Only issues under this epic key."),
        assignee: z.string().optional().describe("Only issues assigned to this name."),
        labels: z.array(z.string()).optional().describe("Only issues having any of these labels."),
        text: z.string().optional().describe("Substring match on title/description."),
        limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 50)."),
        offset: z.number().int().min(0).optional().describe("Pagination offset."),
      },
    },
    (args) => run(() => listIssues(db, args)),
  );

  server.registerTool(
    "ready_work",
    {
      description:
        'The "what should I pick up next" query: open, unblocked issues (no open blocking issues, not manually blocked), ordered by priority then age. Call after finishing something to find the next task.',
      inputSchema: {
        project: projectKeyParam.optional(),
        assignee: z
          .string()
          .optional()
          .describe("Only issues assigned to this name (e.g. your own agent name)."),
        limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 20)."),
      },
    },
    (args) => run(() => readyWork(db, args)),
  );

  server.registerTool(
    "link_issues",
    {
      description:
        'Create a typed link between two issues. "A blocks B" means B cannot start until A closes (ready_work respects this). blocked_by is the same link written from the other side. Cycles in blocks/depends_on are rejected.',
      inputSchema: {
        from: issueKeyParam.describe("Source issue key."),
        to: linkSchema.shape.to.describe("Target issue key."),
        type: linkSchema.shape.type.describe(
          "blocks | blocked_by | depends_on | relates_to | duplicates.",
        ),
      },
    },
    (args) => run(() => linkIssues(db, actor, args.from, args.to, args.type)),
  );

  server.registerTool(
    "unlink_issues",
    {
      description: "Remove a link previously created with link_issues (same from/to/type).",
      inputSchema: {
        from: issueKeyParam.describe("Source issue key."),
        to: linkSchema.shape.to.describe("Target issue key."),
        type: linkSchema.shape.type.describe("Link type to remove."),
      },
    },
    (args) =>
      run(() => {
        unlinkIssues(db, actor, args.from, args.to, args.type);
        return { ok: true };
      }),
  );

  server.registerTool(
    "add_comment",
    {
      description:
        "Add a comment to an issue. Use for progress notes, findings, and handoff context — comments are the audit trail other agents read.",
      inputSchema: {
        issue: issueKeyParam,
        body: z.string().min(1).describe("Comment text (markdown)."),
      },
    },
    (args) =>
      run(() => {
        const c = addComment(db, actor, args.issue, args.body);
        return { id: c.id, authorName: c.authorName, createdAt: c.createdAt };
      }),
  );

  server.registerTool(
    "close_issue",
    {
      description:
        "Close an issue as done (default) or cancelled, optionally adding a closing comment first. Returns the issue plus `unblocked`: keys of issues that this close freed up — check it to decide what to work on next.",
      inputSchema: {
        issue: issueKeyParam,
        status: z
          .enum(["done", "cancelled"])
          .optional()
          .describe('"done" (default) or "cancelled".'),
        comment: z
          .string()
          .optional()
          .describe("Optional closing comment (what was done, where to find it)."),
      },
    },
    (args) =>
      run(() => {
        if (args.comment?.trim()) addComment(db, actor, args.issue, args.comment);
        const { issue, unblocked } = closeIssue(db, actor, args.issue, args.status ?? "done");
        return { ...issue, unblocked };
      }),
  );

  return server;
}
