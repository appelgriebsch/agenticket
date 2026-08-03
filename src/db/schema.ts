import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  nextIssueNumber: integer("next_issue_number").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const statuses = sqliteTable(
  "statuses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("statuses_project_name").on(t.projectId, t.name),
    check("statuses_category", sql`${t.category} IN ('todo','active','done')`),
  ],
);

export const issues = sqliteTable(
  "issues",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    key: text("key").notNull().unique(),
    kind: text("kind").notNull().default("issue"),
    epicId: integer("epic_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("open"),
    priority: integer("priority").notNull().default(2),
    assigneeType: text("assignee_type"),
    assignee: text("assignee"),
    createdByTokenId: integer("created_by_token_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    closedAt: integer("closed_at"),
  },
  (t) => [
    unique("issues_project_number").on(t.projectId, t.number),
    index("issues_project_status").on(t.projectId, t.status),
    index("issues_epic").on(t.epicId),
    index("issues_status").on(t.status),
    check("issues_kind", sql`${t.kind} IN ('epic','issue')`),
    check("issues_priority", sql`${t.priority} BETWEEN 0 AND 4`),
    check(
      "issues_assignee_type",
      sql`${t.assigneeType} IS NULL OR ${t.assigneeType} IN ('agent','human')`,
    ),
  ],
);

export const issueLinks = sqliteTable(
  "issue_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    targetId: integer("target_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    createdByTokenId: integer("created_by_token_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    unique("issue_links_unique").on(t.sourceId, t.targetId, t.type),
    index("issue_links_source").on(t.sourceId),
    index("issue_links_target").on(t.targetId),
    check("issue_links_type", sql`${t.type} IN ('blocks','depends_on','relates_to','duplicates')`),
  ],
);

export const labels = sqliteTable(
  "labels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
  },
  (t) => [unique("labels_project_name").on(t.projectId, t.name)],
);

export const issueLabels = sqliteTable(
  "issue_labels",
  {
    issueId: integer("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    labelId: integer("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.labelId] })],
);

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    issueId: integer("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    authorType: text("author_type").notNull(),
    authorTokenId: integer("author_token_id"),
    authorName: text("author_name").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("comments_issue").on(t.issueId),
    check("comments_author_type", sql`${t.authorType} IN ('agent','human')`),
  ],
);

export const tokens = sqliteTable("tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
