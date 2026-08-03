import type { Child, FC } from "hono/jsx";
import type { IssueSummary } from "../domain/index.js";

/** Shared JSX building blocks for the web UI. Pure presentation, no db access. */

export const Layout: FC<{
  title: string;
  crumb?: Child;
  active?: "projects" | "ready" | "tokens";
  version: string;
  children?: Child;
}> = ({ title, crumb, active, version, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · agenticket</title>
      <link rel="stylesheet" href="/assets/app.css" />
    </head>
    <body>
      <div class="shell">
        <header class="top">
          <a class="brand" href="/">
            agenticket
          </a>
          {crumb ? <span class="crumb mono">{crumb}</span> : null}
          <nav class="top">
            <a href="/" aria-current={active === "projects" ? "page" : undefined}>
              projects
            </a>
            <a href="/ready" aria-current={active === "ready" ? "page" : undefined}>
              ready
            </a>
            <a href="/tokens" aria-current={active === "tokens" ? "page" : undefined}>
              tokens
            </a>
            <form method="post" action="/logout">
              <button type="submit">logout</button>
            </form>
          </nav>
        </header>
        {children}
        <div class="statusline">
          <span>
            <kbd>/</kbd> filter · <kbd>ctrl+enter</kbd> post comment
          </span>
          <span class="right mono">v{version}</span>
        </div>
      </div>
      <script src="/assets/app.js" />
    </body>
  </html>
);

/** Bare layout for the login page (no nav, no session). */
export const LoginLayout: FC<{ children?: Child }> = ({ children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>login · agenticket</title>
      <link rel="stylesheet" href="/assets/app.css" />
    </head>
    <body>{children}</body>
  </html>
);

export const StatusBadge: FC<{ status: string }> = ({ status }) => (
  <span class={`st st-${status}`}>{status.replace("_", " ")}</span>
);

export const PriorityTag: FC<{ priority: number }> = ({ priority }) => (
  <span class={`pri pri-${priority} mono`}>P{priority}</span>
);

export const ActorName: FC<{ type: string; name: string }> = ({ type, name }) => (
  <span class={type === "agent" ? "agent" : "human"}>{name}</span>
);

export const Labels: FC<{ labels: string[] }> = ({ labels }) => (
  <>
    {labels.map((l) => (
      <span class="label">{l}</span>
    ))}{" "}
  </>
);

export const BlockedFlag: FC<{ blockedBy: string[] }> = ({ blockedBy }) =>
  blockedBy.length === 0 ? null : (
    <span class="blockedflag" title={`blocked by ${blockedBy.join(", ")}`}>
      ⊘ blocked by {blockedBy.join(", ")}
    </span>
  );

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function absTime(ts: number): string {
  return `${new Date(ts).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

/** One issue row. `tree` renders the child connector for issues under an epic. */
export const IssueRow: FC<{ issue: IssueSummary; tree?: "mid" | "last"; extra?: Child }> = ({
  issue,
  tree,
  extra,
}) => (
  <tr class={issue.kind === "epic" ? "epic" : undefined}>
    <td class="key mono">{issue.key}</td>
    <td class="title">
      {tree ? <span class="tree mono">{tree === "last" ? "└─ " : "├─ "}</span> : null}
      <a href={`/i/${issue.key}`}>{issue.title}</a> <BlockedFlag blockedBy={issue.blockedBy} />
      {extra}
    </td>
    <td>
      <StatusBadge status={issue.status} />
    </td>
    <td>
      <PriorityTag priority={issue.priority} />
    </td>
    <td>
      {issue.assignee ? (
        <ActorName type={issue.assigneeType ?? "human"} name={issue.assignee} />
      ) : (
        "—"
      )}
    </td>
    <td>
      <Labels labels={issue.labels} />
    </td>
    <td class="key mono" title={absTime(issue.updatedAt)}>
      {timeAgo(issue.updatedAt)}
    </td>
  </tr>
);

export const IssueTableHead: FC = () => (
  <thead>
    <tr>
      <th>key</th>
      <th>title</th>
      <th>status</th>
      <th>pri</th>
      <th>assignee</th>
      <th>labels</th>
      <th>updated</th>
    </tr>
  </thead>
);
