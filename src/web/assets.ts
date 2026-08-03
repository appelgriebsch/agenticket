/**
 * Static assets for the web UI, served from memory (no files to resolve at
 * runtime — same reasoning as the embedded migrations). The stylesheet is
 * compiled from src/web/app.css by Tailwind 4 at build time (`npm run
 * css:generate`) and committed as app.css.gen.ts; pages work without JS.
 */

export { APP_CSS } from "./app.css.gen.js";

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
    const filter = document.querySelector("input[name=f]");
    if (filter) { e.preventDefault(); filter.focus(); }
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && tag === "TEXTAREA") {
    document.activeElement.form?.requestSubmit();
  }
});
`;
