/**
 * Static assets for the web UI, served from memory (no files to resolve at
 * runtime — same reasoning as the embedded migrations). One stylesheet, one
 * small enhancement script; pages work without JS.
 */

export const APP_CSS = /* css */ `
:root {
  --bg: #0d1016;
  --panel: #141924;
  --panel-2: #1a2130;
  --rule: #232c3d;
  --text: #d7dee8;
  --dim: #8a96a8;
  --faint: #4d5a6e;
  --accent: #ffb454;
  --ok: #8fdd85;
  --info: #64cce8;
  --danger: #f2757f;
  --epic: #d8c5ff;
  font-size: 16px;
}
* { box-sizing: border-box; }
html, body { background: var(--bg); }
body {
  color: var(--text);
  font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
  margin: 0;
}
.mono {
  font-family: "Berkeley Mono", "JetBrains Mono", "Cascadia Code", ui-monospace,
    "SF Mono", Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
a { color: var(--info); text-decoration: none; }
a:hover, a:focus-visible { text-decoration: underline; outline: none; }

.shell { padding: 1.5rem clamp(1.5rem, 4vw, 4rem) 5rem; }
header.top {
  display: flex; flex-wrap: wrap; gap: 1rem 2rem; align-items: baseline;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 1rem; margin-bottom: 2rem;
}
.brand { font-weight: 700; font-size: 1.05rem; color: var(--accent); }
a.brand:hover { text-decoration: none; }
.crumb { color: var(--dim); }
.crumb b { color: var(--text); font-weight: 600; }
nav.top { margin-left: auto; display: flex; gap: 1.75rem; font-size: 0.95rem; align-items: baseline; }
nav.top a { color: var(--dim); }
nav.top a[aria-current] { color: var(--accent); }
nav.top form { display: inline; }
nav.top button {
  background: none; border: none; color: var(--dim); font: inherit;
  cursor: pointer; padding: 0;
}
nav.top button:hover { text-decoration: underline; }

.pagehead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 1rem 1.5rem; margin-bottom: 1.5rem; }
.pagehead h1 { font-size: 1.5rem; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
.pagehead .sub { color: var(--dim); }

.filterline {
  display: flex; gap: 0.75rem; align-items: center;
  background: var(--panel); border: 1px solid var(--rule); border-radius: 8px;
  padding: 0.65rem 1rem; margin-bottom: 1.75rem;
  max-width: 56rem;
}
.filterline:focus-within { border-color: var(--accent); }
.filterline .gt { color: var(--accent); font-weight: 700; }
.filterline input {
  flex: 1; background: none; border: none; color: var(--text);
  font-size: 1rem; outline: none; min-width: 10rem;
}
.filterline .hint { color: var(--faint); white-space: nowrap; font-size: 0.85rem; }

.st {
  display: inline-block; white-space: nowrap; font-size: 0.85rem;
  padding: 0.1rem 0.6rem; border-radius: 99px; border: 1px solid var(--rule);
  background: var(--panel);
}
.st-open { color: var(--dim); }
.st-in_progress { color: var(--info); border-color: color-mix(in srgb, var(--info) 40%, transparent); }
.st-blocked { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent); }
.st-in_review { color: var(--epic); border-color: color-mix(in srgb, var(--epic) 40%, transparent); }
.st-done { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 35%, transparent); }
.st-cancelled { color: var(--faint); text-decoration: line-through; }
.pri { color: var(--dim); }
.pri-0 { color: var(--danger); font-weight: 700; }
.pri-1 { color: var(--accent); font-weight: 600; }
.agent { color: var(--accent); }
.agent::before { content: "\\26A1"; }
.human::before { content: "@"; color: var(--dim); }
.label {
  color: var(--dim); font-size: 0.85rem; background: var(--panel-2);
  padding: 0.05rem 0.55rem; border-radius: 4px; white-space: nowrap;
}
.blockedflag { color: var(--danger); font-size: 0.9rem; white-space: nowrap; }

.tablewrap { overflow-x: auto; }
table.issues { border-collapse: collapse; width: 100%; }
table.issues th {
  text-align: left; font-weight: 500; color: var(--faint);
  text-transform: uppercase; letter-spacing: 0.09em; font-size: 0.75rem;
  padding: 0 1.25rem 0.6rem 0; border-bottom: 1px solid var(--rule);
}
table.issues td {
  padding: 0.7rem 1.25rem 0.7rem 0;
  border-bottom: 1px solid var(--panel-2);
  white-space: nowrap; vertical-align: baseline;
}
table.issues td.title { white-space: normal; min-width: 22rem; width: 100%; }
table.issues td.title a { color: var(--text); font-weight: 500; }
table.issues tr:hover td { background: var(--panel); }
.key { color: var(--dim); font-size: 0.9rem; }
tr.epic td { background: color-mix(in srgb, var(--epic) 4%, transparent); }
tr.epic .key, tr.epic td.title a { color: var(--epic); }
.tree { color: var(--faint); }
.progress { color: var(--faint); font-size: 0.9rem; font-weight: 400; }
.empty { color: var(--faint); padding: 2rem 0; }

.statusline {
  color: var(--faint); border-top: 1px solid var(--rule);
  margin-top: 2rem; padding-top: 1rem;
  display: flex; gap: 2.5rem; flex-wrap: wrap; font-size: 0.9rem;
}
.statusline .right { margin-left: auto; }
kbd {
  color: var(--text); background: var(--panel); border: 1px solid var(--faint);
  border-radius: 4px; padding: 0 0.35em; font-size: 0.85em;
}

.detailgrid {
  display: grid; grid-template-columns: minmax(0, 1fr) 20rem;
  gap: 0 4rem; align-items: start;
}
@media (max-width: 60rem) { .detailgrid { grid-template-columns: 1fr; } }

.issuehead { margin: 0 0 0.5rem; }
.issuehead .key { font-size: 1.1rem; }
.issuehead h1 {
  font-size: 1.6rem; font-weight: 700; margin: 0.25rem 0 0;
  letter-spacing: -0.01em; max-width: 40ch; text-wrap: balance;
}
.headmeta { display: flex; flex-wrap: wrap; gap: 0.6rem 1rem; align-items: center; margin: 1rem 0 2rem; }

aside .meta {
  background: var(--panel); border: 1px solid var(--rule); border-radius: 10px;
  padding: 1.25rem 1.5rem; margin: 0;
  display: grid; grid-template-columns: max-content 1fr; gap: 0.8rem 1.25rem;
  align-items: center; font-size: 0.95rem;
}
aside .meta dt { color: var(--faint); }
aside .meta dd { margin: 0; }

input.ctl, select.ctl, button.ctl, textarea.ctl {
  background: var(--panel-2); color: var(--text); border: 1px solid var(--rule);
  border-radius: 6px; font: inherit; font-size: 0.9rem;
  padding: 0.25rem 0.6rem;
}
select.ctl, button.ctl { cursor: pointer; }
input.ctl:focus-visible, select.ctl:focus-visible, button.ctl:focus-visible,
textarea:focus-visible { border-color: var(--accent); outline: none; }
button.ctl.primary {
  color: #141924; background: var(--accent); border-color: var(--accent); font-weight: 600;
}
button.ctl.danger { color: var(--danger); }

section.block { margin: 0 0 2.5rem; }
section.block > h2 {
  font-size: 0.8rem; font-weight: 600; color: var(--faint);
  text-transform: uppercase; letter-spacing: 0.09em;
  margin: 0 0 0.9rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--rule);
}
.desc {
  max-width: 65ch; white-space: pre-wrap; overflow-wrap: break-word; margin: 0;
  font: inherit; font-size: 1rem; line-height: 1.7;
}

ul.links { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
ul.links li { display: flex; gap: 1rem; align-items: baseline; flex-wrap: wrap; }
.ltype { color: var(--faint); width: 8.5rem; font-size: 0.9rem; }

.comment {
  background: var(--panel); border: 1px solid var(--rule); border-radius: 10px;
  padding: 1rem 1.25rem; margin: 0 0 1rem; max-width: 46rem;
}
.comment.by-agent { border-left: 3px solid var(--accent); }
.comment .chead { color: var(--dim); font-size: 0.9rem; margin-bottom: 0.35rem; }
.comment .chead time { color: var(--faint); }
.comment p { margin: 0; white-space: pre-wrap; overflow-wrap: break-word; line-height: 1.65; }

.commentbox { margin-top: 1.5rem; max-width: 46rem; }
.commentbox textarea {
  width: 100%; background: var(--panel); border: 1px solid var(--rule);
  border-radius: 10px; color: var(--text); font: inherit; font-size: 1rem;
  padding: 0.85rem 1.1rem; min-height: 5.5rem; resize: vertical;
  display: block; margin-bottom: 0.75rem;
}

.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr)); gap: 1.25rem; }
.card {
  background: var(--panel); border: 1px solid var(--rule); border-radius: 10px;
  padding: 1.25rem 1.5rem; display: grid; gap: 0.4rem;
}
.card h2 { margin: 0; font-size: 1.1rem; }
.card h2 a { color: var(--text); }
.card .counts { color: var(--dim); font-size: 0.9rem; display: flex; gap: 1.25rem; }
.card .counts b { font-weight: 600; }
.card .counts .todo b { color: var(--text); }
.card .counts .active b { color: var(--info); }
.card .counts .done b { color: var(--ok); }

form.inlineform {
  display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
  background: var(--panel); border: 1px solid var(--rule); border-radius: 10px;
  padding: 1rem 1.25rem; margin-top: 2rem; max-width: 46rem;
}
form.inlineform input.ctl { padding: 0.4rem 0.7rem; }

.notice {
  border: 1px solid color-mix(in srgb, var(--ok) 40%, transparent);
  background: color-mix(in srgb, var(--ok) 8%, transparent);
  border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; max-width: 46rem;
}
.notice.error {
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}
.notice code.token {
  display: block; margin-top: 0.5rem; padding: 0.5rem 0.75rem;
  background: var(--bg); border-radius: 6px; color: var(--accent);
  overflow-x: auto; user-select: all;
}

table.plain { border-collapse: collapse; width: 100%; max-width: 60rem; }
table.plain th {
  text-align: left; font-weight: 500; color: var(--faint);
  text-transform: uppercase; letter-spacing: 0.09em; font-size: 0.75rem;
  padding: 0 1.25rem 0.6rem 0; border-bottom: 1px solid var(--rule);
}
table.plain td {
  padding: 0.7rem 1.25rem 0.7rem 0; border-bottom: 1px solid var(--panel-2);
  vertical-align: baseline;
}
.revoked { color: var(--faint); text-decoration: line-through; }

.loginbox {
  max-width: 24rem; margin: 15vh auto 0; display: grid; gap: 1rem;
  background: var(--panel); border: 1px solid var(--rule); border-radius: 12px;
  padding: 2rem;
}
.loginbox h1 { margin: 0; font-size: 1.3rem; }
.loginbox input.ctl { width: 100%; padding: 0.55rem 0.8rem; font-size: 1rem; }
.loginbox button { padding: 0.55rem 0.8rem; font-size: 1rem; }
.loginbox .hint { color: var(--faint); font-size: 0.9rem; }
`;

export const APP_JS = /* js */ `
// Progressive enhancement only — every page works without this file.
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el instanceof HTMLSelectElement && el.dataset.autosubmit !== undefined) {
    el.form?.requestSubmit();
  }
});
document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if (e.key === "/" && !typing) {
    const filter = document.querySelector(".filterline input");
    if (filter) { e.preventDefault(); filter.focus(); }
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && tag === "TEXTAREA") {
    document.activeElement.form?.requestSubmit();
  }
});
`;
