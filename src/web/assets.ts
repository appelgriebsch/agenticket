/**
 * Static assets for the web UI, served from memory (no files to resolve at
 * runtime — same reasoning as the embedded migrations). The stylesheet is
 * compiled from src/web/app.css by Tailwind 4 at build time (`npm run
 * css:generate`) and committed as app.css.gen.ts; pages work without JS.
 */

export { APP_CSS } from "./app.css.gen.js";

export const APP_JS = /* js */ `
// Progressive enhancement only — every page works without this file.
function syncSelection(form) {
  const boxes = [...form.querySelectorAll("[data-issue-select]")];
  const selected = boxes.filter((box) => box.checked).length;
  const count = form.querySelector("[data-selection-count]");
  const toolbar = form.querySelector("[data-selection-toolbar]");
  const selectAll = form.querySelector("[data-select-all]");
  if (count) count.textContent = String(selected);
  if (toolbar) toolbar.hidden = selected === 0;
  if (selectAll) {
    selectAll.checked = boxes.length > 0 && selected === boxes.length;
    selectAll.indeterminate = selected > 0 && selected < boxes.length;
  }
}

document.querySelectorAll("[data-bulk-delete]").forEach(syncSelection);

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el instanceof HTMLSelectElement && el.dataset.autosubmit !== undefined) {
    el.form?.requestSubmit();
  }
  if (el instanceof HTMLInputElement && el.dataset.selectAll !== undefined) {
    const form = el.form;
    if (!form) return;
    form.querySelectorAll("[data-issue-select]").forEach((box) => {
      box.checked = el.checked;
    });
    syncSelection(form);
  } else if (el instanceof HTMLInputElement && el.dataset.issueSelect !== undefined && el.form) {
    syncSelection(el.form);
  }
});
document.addEventListener("submit", (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  const message = form.dataset.confirm;
  if (message && !window.confirm(message)) {
    e.preventDefault();
    return;
  }
  if (form.dataset.bulkDelete !== undefined) {
    const selected = form.querySelectorAll("[data-issue-select]:checked").length;
    if (selected === 0) {
      e.preventDefault();
      window.alert("Select at least one issue to delete.");
      return;
    }
    const noun = selected === 1 ? "issue" : "issues";
    if (!window.confirm("Delete " + selected + " selected " + noun + "? This cannot be undone.")) {
      e.preventDefault();
    }
  }
});
document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if (e.key === "/" && !typing) {
    const filter = document.querySelector("input[name=f]");
    if (filter) { e.preventDefault(); filter.focus(); }
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && tag === "TEXTAREA") {
    document.activeElement.form?.requestSubmit();
  }
});
`;
