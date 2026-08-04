import type { Child, FC } from "hono/jsx";
import type { IssueSummary } from "../domain/index.js";

/** Shared JSX building blocks for the web UI. Pure presentation, no db access. */

const NAV_LINK =
  "rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground";
const NAV_ACTIVE = "rounded-md bg-muted px-2.5 py-1.5 font-medium text-foreground";

export const Kbd: FC<{ children?: Child }> = ({ children }) => (
  <kbd class="rounded border border-border bg-muted px-1.5 py-px font-mono text-[11px] text-muted-foreground">
    {children}
  </kbd>
);

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
      <header class="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div class="mx-auto flex h-12 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <a class="font-semibold tracking-tight text-foreground" href="/">
            agenticket
          </a>
          {crumb ? (
            <span class="truncate font-mono text-xs text-muted-foreground">{crumb}</span>
          ) : null}
          <nav class="ml-auto flex items-center gap-1 text-sm">
            <a class={active === "projects" ? NAV_ACTIVE : NAV_LINK} href="/">
              Projects
            </a>
            <a class={active === "ready" ? NAV_ACTIVE : NAV_LINK} href="/ready">
              Ready
            </a>
            <a class={active === "tokens" ? NAV_ACTIVE : NAV_LINK} href="/tokens">
              Tokens
            </a>
            <form class="inline" method="post" action="/logout">
              <button class={`cursor-pointer ${NAV_LINK}`} type="submit">
                Log out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <div class="mx-auto max-w-6xl px-4 pt-6 pb-16 sm:px-6">
        {children}
        <div class="mt-10 flex flex-wrap items-center gap-6 border-t border-border pt-4 text-xs text-muted-foreground">
          <span class="flex items-center gap-1.5">
            <Kbd>/</Kbd> filter
          </span>
          <span class="flex items-center gap-1.5">
            <Kbd>ctrl+enter</Kbd> post comment
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
      <span class="font-normal text-muted-foreground">@</span>
      {name}
    </span>
  );

export const Labels: FC<{ labels: string[] }> = ({ labels }) => (
  <>
    {labels.map((l) => (
      <span class="mr-1 inline-block rounded-md border border-border bg-muted/50 px-1.5 py-px text-xs whitespace-nowrap text-muted-foreground">
        {l}
      </span>
    ))}
  </>
);

export const BlockedFlag: FC<{ blockedBy: string[] }> = ({ blockedBy }) =>
  blockedBy.length === 0 ? null : (
    <span
      class="text-xs font-medium whitespace-nowrap text-destructive"
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

const CELL = "px-3 py-2 align-middle whitespace-nowrap";
export const KEY_TEXT = "font-mono text-xs text-muted-foreground";

/** One issue row. `tree` renders the child connector for issues under an epic. */
export const IssueRow: FC<{ issue: IssueSummary; tree?: "mid" | "last"; extra?: Child }> = ({
  issue,
  tree,
  extra,
}) => {
  const epic = issue.kind === "epic";
  return (
    <tr class="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
      <td
        class={`${CELL} ${
          epic ? "font-mono text-xs text-violet-600 dark:text-violet-400" : KEY_TEXT
        }`}
      >
        {issue.key}
      </td>
      <td class={`${CELL} w-full min-w-80 whitespace-normal`}>
        {tree ? (
          <span class="font-mono text-xs text-muted-foreground/50">
            {tree === "last" ? "└─ " : "├─ "}
          </span>
        ) : null}
        <a
          class={`font-medium hover:underline ${
            epic ? "text-violet-700 dark:text-violet-400" : "text-foreground"
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
          <span class="text-muted-foreground">—</span>
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
  "h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground";

export const IssueTableHead: FC = () => (
  <thead>
    <tr class="border-b border-border bg-muted/40">
      <th class={TH}>Key</th>
      <th class={TH}>Title</th>
      <th class={TH}>Status</th>
      <th class={TH}>Pri</th>
      <th class={TH}>Assignee</th>
      <th class={TH}>Labels</th>
      <th class={TH}>Updated</th>
    </tr>
  </thead>
);
