/**
 * Minimal, dependency-free markdown → HTML renderer for issue descriptions and
 * comments. All input is HTML-escaped before any markup is applied, so raw HTML
 * never passes through. Link hrefs are restricted to http(s), site-relative,
 * and fragment URLs.
 *
 * Supported: headings, fenced code blocks, inline code, bold, italic, links,
 * unordered/ordered lists, blockquotes, horizontal rules, paragraphs with
 * GitHub-style hard line breaks.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline markup. The text is split on code spans first so their contents stay
 * literal; everything is HTML-escaped before any markup is applied. */
function inline(text: string): string {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => {
      const code = part.match(/^`([^`]+)`$/);
      if (code?.[1]) return `<code>${escapeHtml(code[1])}</code>`;
      let s = escapeHtml(part);
      s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
      s = s.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*|#[^\s)]*)\)/g,
        '<a href="$2" rel="noopener">$1</a>',
      );
      return s;
    })
    .join("");
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) {
        buf.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // closing fence
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading?.[1] && heading[2] !== undefined) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push("<hr />");
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        buf.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${inline(buf.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push(`<li>${inline((lines[i] ?? "").replace(/^[-*]\s+/, ""))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i] ?? "")) {
        items.push(`<li>${inline((lines[i] ?? "").replace(/^\d+[.)]\s+/, ""))}</li>`);
        i += 1;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block.
    const buf: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (l.trim() === "" || /^(```|#{1,6}\s|[-*]\s|\d+[.)]\s|>\s?|-{3,}\s*$)/.test(l)) break;
      buf.push(inline(l));
      i += 1;
    }
    out.push(`<p>${buf.join("<br />")}</p>`);
  }
  return out.join("\n");
}
