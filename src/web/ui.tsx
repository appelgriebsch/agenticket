import type { Child, FC } from "hono/jsx";
import type { IssueSummary } from "../domain/index.js";

/** Shared JSX building blocks for the web UI. Pure presentation, no db access. */

const NAV_LINK = "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100";
const NAV_ACTIVE = "font-medium text-amber-600 dark:text-amber-400";

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
      <div class="px-6 pt-6 pb-20 sm:px-10">
        <header class="mb-8 flex flex-wrap items-baseline gap-x-8 gap-y-4 border-b border-gray-200 pb-4 dark:border-gray-800">
          <a class="text-lg font-bold text-amber-600 dark:text-amber-400" href="/">
            agenticket
          </a>
          {crumb ? (
            <span class="font-mono text-sm text-gray-500 dark:text-gray-400">{crumb}</span>
          ) : null}
          <nav class="ml-auto flex items-baseline gap-7">
            <a class={active === "projects" ? NAV_ACTIVE : NAV_LINK} href="/">
              projects
            </a>
            <a class={active === "ready" ? NAV_ACTIVE : NAV_LINK} href="/ready">
              ready
            </a>
            <a class={active === "tokens" ? NAV_ACTIVE : NAV_LINK} href="/tokens">
              tokens
            </a>
            <form class="inline" method="post" action="/logout">
              <button class={`cursor-pointer hover:underline ${NAV_LINK}`} type="submit">
                logout
              </button>
            </form>
          </nav>
        </header>
        {children}
        <div class="mt-8 flex flex-wrap gap-10 border-t border-gray-200 pt-4 text-sm text-gray-400 dark:border-gray-800 dark:text-gray-500">
          <span>
            <kbd class="rounded border border-gray-300 bg-gray-100 px-1.5 font-mono text-xs dark:border-gray-700 dark:bg-gray-800">
              /
            </kbd>{" "}
            filter ·{" "}
            <kbd class="rounded border border-gray-300 bg-gray-100 px-1.5 font-mono text-xs dark:border-gray-700 dark:bg-gray-800">
              ctrl+enter
            </kbd>{" "}
            post comment
          </span>
          <span class="ml-auto font-mono">v{version}</span>
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
  <span class={`pri pri-${priority} font-mono`}>P{priority}</span>
);

export const ActorName: FC<{ type: string; name: string }> = ({ type, name }) =>
  type === "agent" ? (
    <span class="agent">⚡{name}</span>
  ) : (
    <span class="human">
      <span class="font-normal text-gray-400 dark:text-gray-500">@</span>
      {name}
    </span>
  );

export const Labels: FC<{ labels: string[] }> = ({ labels }) => (
  <>
    {labels.map((l) => (
      <span class="rounded bg-gray-100 px-2 py-0.5 text-xs whitespace-nowrap text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        {l}
      </span>
    ))}{" "}
  </>
);

export const BlockedFlag: FC<{ blockedBy: string[] }> = ({ blockedBy }) =>
  blockedBy.length === 0 ? null : (
    <span
      class="text-sm whitespace-nowrap text-red-600 dark:text-red-400"
      title={`blocked by ${blockedBy.join(", ")}`}
    >
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

const CELL =
  "border-b border-gray-100 py-3 pr-6 align-baseline whitespace-nowrap dark:border-gray-800/80";
export const KEY_TEXT = "font-mono text-sm text-gray-500 dark:text-gray-400";

/** One issue row. `tree` renders the child connector for issues under an epic. */
export const IssueRow: FC<{ issue: IssueSummary; tree?: "mid" | "last"; extra?: Child }> = ({
  issue,
  tree,
  extra,
}) => {
  const epic = issue.kind === "epic";
  return (
    <tr
      class={`group hover:bg-gray-50 dark:hover:bg-gray-900 ${
        epic ? "bg-purple-50/60 dark:bg-purple-500/5" : ""
      }`}
    >
      <td
        class={`${CELL} ${epic ? "font-mono text-sm text-purple-700 dark:text-purple-300" : KEY_TEXT}`}
      >
        {issue.key}
      </td>
      <td class={`${CELL} w-full min-w-88 whitespace-normal`}>
        {tree ? (
          <span class="font-mono text-gray-300 dark:text-gray-600">
            {tree === "last" ? "└─ " : "├─ "}
          </span>
        ) : null}
        <a
          class={`font-medium hover:underline ${
            epic ? "text-purple-700 dark:text-purple-300" : "text-gray-900 dark:text-gray-100"
          }`}
          href={`/i/${issue.key}`}
        >
          {issue.title}
        </a>{" "}
        <BlockedFlag blockedBy={issue.blockedBy} />
        {extra}
      </td>
      <td class={CELL}>
        <StatusBadge status={issue.status} />
      </td>
      <td class={CELL}>
        <PriorityTag priority={issue.priority} />
      </td>
      <td class={CELL}>
        {issue.assignee ? (
          <ActorName type={issue.assigneeType ?? "human"} name={issue.assignee} />
        ) : (
          "—"
        )}
      </td>
      <td class={CELL}>
        <Labels labels={issue.labels} />
      </td>
      <td class={`${CELL} ${KEY_TEXT}`} title={absTime(issue.updatedAt)}>
        {timeAgo(issue.updatedAt)}
      </td>
    </tr>
  );
};

const TH =
  "border-b border-gray-200 pb-2 pr-6 text-left text-xs font-medium tracking-wider text-gray-400 uppercase dark:border-gray-800 dark:text-gray-500";

export const IssueTableHead: FC = () => (
  <thead>
    <tr>
      <th class={TH}>key</th>
      <th class={TH}>title</th>
      <th class={TH}>status</th>
      <th class={TH}>pri</th>
      <th class={TH}>assignee</th>
      <th class={TH}>labels</th>
      <th class={TH}>updated</th>
    </tr>
  </thead>
);
