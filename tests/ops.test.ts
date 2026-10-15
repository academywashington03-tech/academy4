import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "../lib/csv.ts";
import { renderEmail, escapeHtml } from "../lib/email-templates.ts";

test("CSV: quoting and formula-injection protection", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("=HYPERLINK(\"http://evil\")"), "\"'=HYPERLINK(\"\"http://evil\"\")\"");
  for (const f of ["=1+1", "+1", "-1", "@SUM(A1)"]) assert.ok(csvCell(f).startsWith("'"), f);
  assert.equal(csvCell(-5), "-5");           // real numbers are not text
  assert.equal(csvCell(null), ""); assert.equal(csvCell("مرحبا"), "مرحبا");
});
test("CSV: BOM, header and CRLF rows", () => {
  const out = toCsv([{ key: "n", label: "الاسم" }, { key: "v", label: "v" }], [{ n: "أحمد", v: 1 }, { n: "=cmd", v: 2 }]);
  assert.ok(out.startsWith("\uFEFFالاسم,v\r\n")); assert.ok(out.includes("'=cmd,2\r\n"));
});
test("email: escapes all dynamic text and builds safe links", () => {
  const { html, text } = renderEmail({ siteUrl: "https://x.com/", title: "<script>alert(1)</script>", body: 'a "b" & <img src=x onerror=1>', ctaLabel: "افتح", ctaPath: "/dashboard" });
  assert.ok(!html.includes("<script>")); assert.ok(!html.includes("<img src=x")); assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes('dir="rtl"')); assert.ok(html.includes("https://x.com/dashboard")); assert.ok(text.includes("https://x.com/dashboard"));
  assert.ok(!renderEmail({ siteUrl: "https://x.com", title: "t", body: "b", ctaLabel: "go", ctaPath: "//evil.com" }).html.includes("evil.com"));
  assert.ok(!renderEmail({ siteUrl: "https://x.com", title: "t", body: "b", ctaLabel: "go", ctaPath: "https://evil.com" }).html.includes("evil.com"));
  assert.equal(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});
