import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/web/markdown.js";

describe("renderMarkdown", () => {
  it("escapes raw HTML", () => {
    const html = renderMarkdown('<script>alert("x")</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders headings, bold, italic, and inline code", () => {
    expect(renderMarkdown("## Plan")).toBe("<h2>Plan</h2>");
    expect(renderMarkdown("**bold** and *em* and `code`")).toBe(
      "<p><strong>bold</strong> and <em>em</em> and <code>code</code></p>",
    );
  });

  it("keeps code span contents literal", () => {
    expect(renderMarkdown("`<b>**x**</b>`")).toBe("<p><code>&lt;b&gt;**x**&lt;/b&gt;</code></p>");
  });

  it("renders fenced code blocks with escaping", () => {
    const html = renderMarkdown('```js\nif (a < b) run("x");\n```');
    expect(html).toBe('<pre><code>if (a &lt; b) run(&quot;x&quot;);</code></pre>');
  });

  it("renders lists", () => {
    expect(renderMarkdown("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
    expect(renderMarkdown("1. one\n2. two")).toBe("<ol><li>one</li><li>two</li></ol>");
  });

  it("renders safe links and rejects unsafe schemes", () => {
    expect(renderMarkdown("[docs](https://example.com/a)")).toBe(
      '<p><a href="https://example.com/a" rel="noopener">docs</a></p>',
    );
    const unsafe = renderMarkdown("[x](javascript:alert(1))");
    expect(unsafe).not.toContain("<a");
  });

  it("renders blockquotes and hr", () => {
    expect(renderMarkdown("> quoted")).toBe("<blockquote>quoted</blockquote>");
    expect(renderMarkdown("---")).toBe("<hr />");
  });

  it("joins single newlines as hard breaks and blank lines as paragraphs", () => {
    expect(renderMarkdown("a\nb\n\nc")).toBe("<p>a<br />b</p>\n<p>c</p>");
  });

  it("leaves bare numbers untouched", () => {
    expect(renderMarkdown("retry 3 times")).toBe("<p>retry 3 times</p>");
  });
});
