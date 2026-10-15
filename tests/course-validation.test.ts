import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoneyToMinor, slugify, isValidSlug, parseVideoInput, validateUpload, sanitizeFileName, validateCourseText, UUID_RE } from "../lib/course-validation.ts";

test("money parsing to integer piastres", () => {
  assert.equal(parseMoneyToMinor("150"), 15000);
  assert.equal(parseMoneyToMinor("150.5"), 15050);
  assert.equal(parseMoneyToMinor("١٥٠٫٥٠"), 15050);
  assert.equal(parseMoneyToMinor("0.05"), 5);
  for (const bad of ["-5", "1.234", "abc", "", "1e3", "12345678901"]) assert.equal(parseMoneyToMinor(bad), null);
});
test("slugs", () => {
  assert.equal(slugify("Intro to Excel 2026!"), "intro-to-excel-2026");
  assert.equal(slugify("دورة عربية"), "");
  assert.ok(isValidSlug("abc-123")); assert.ok(!isValidSlug("-abc")); assert.ok(!isValidSlug("ab")); assert.ok(!isValidSlug("a b c"));
});
test("video input parsing", () => {
  assert.deepEqual(parseVideoInput("youtube", "https://youtu.be/dQw4w9WgXcQ"), { provider: "youtube", ref: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideoInput("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5"), { provider: "youtube", ref: "dQw4w9WgXcQ" });
  assert.equal(parseVideoInput("youtube", "https://evil.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseVideoInput("youtube", "javascript:alert(1)"), null);
  assert.ok(parseVideoInput("cloudflare_stream", "a".repeat(32)));
  assert.equal(parseVideoInput("cloudflare_stream", "not-a-uid"), null);
  assert.equal(parseVideoInput("vimeo", "123"), null);
});
test("upload validation", () => {
  assert.equal(validateUpload("resource", "a.pdf", "application/pdf", 1000), null);
  assert.equal(validateUpload("resource", "a.pdf", "application/pdf", 60 * 1024 * 1024), "too_large");
  assert.equal(validateUpload("resource", "a.exe", "application/x-msdownload", 10), "type");
  assert.equal(validateUpload("resource", "a.exe", "application/pdf", 10), "type"); // extension must match type
  assert.equal(validateUpload("resource", "a.pdf", "application/pdf", 0), "empty");
  assert.equal(validateUpload("cover", "c.png", "image/png", 6 * 1024 * 1024), "too_large");
  assert.equal(validateUpload("cover", "c.pdf", "application/pdf", 10), "type");
});
test("file names are sanitized (no traversal)", () => {
  assert.equal(sanitizeFileName("../../etc/passwd.pdf"), "file.pdf");
  assert.equal(sanitizeFileName("ملف عربي.PDF"), "file.pdf");
  assert.equal(sanitizeFileName("a.b.zip"), "file.zip");
});
test("course text validation", () => {
  assert.ok(!validateCourseText({ title: "ab" }).ok);
  const r = validateCourseText({ title: "دورة ممتازة", objectives: "a\n\n b ", duration_minutes: "٩٠", pass_score: "80" });
  assert.ok(r.ok); if (r.ok) { assert.deepEqual(r.clean.objectives, ["a", "b"]); assert.equal(r.clean.duration_minutes, 90); }
  assert.ok(!validateCourseText({ title: "valid title", pass_score: "150" }).ok);
});
test("uuid check", () => { assert.ok(UUID_RE.test("00000000-0000-0000-0000-0000000000a1")); assert.ok(!UUID_RE.test("1; drop table")); });
import { validateCoupon, validateReceipt } from "../lib/course-validation.ts";
test("reserved slugs cannot be used (they would shadow checkout routes)", () => {
  for (const r of ["result", "bundle", "manual", "new"]) assert.ok(!isValidSlug(r));
});
test("coupon validation", () => {
  const ok = validateCoupon({ code: " eid-25 ", kind: "percent", value: "25", expires: "2026-12-31", max: "100", scope: "all" });
  assert.ok(ok.ok); if (ok.ok) { assert.equal(ok.clean.code, "EID-25"); assert.equal(ok.clean.percent_off, 25); assert.equal(ok.clean.amount_off_minor, null); assert.equal(ok.clean.expires_at, "2026-12-31T23:59:59Z"); }
  const fixed = validateCoupon({ code: "FIX50", kind: "fixed", value: "50.5", scope: "course:00000000-0000-0000-0000-0000000000f2" });
  assert.ok(fixed.ok); if (fixed.ok) { assert.equal(fixed.clean.amount_off_minor, 5050); assert.equal(fixed.clean.course_id, "00000000-0000-0000-0000-0000000000f2"); }
  for (const bad of [{ code: "a", kind: "percent", value: "10" }, { code: "OKAY", kind: "percent", value: "100" }, { code: "OKAY", kind: "percent", value: "0" },
    { code: "OKAY", kind: "fixed", value: "-5" }, { code: "OKAY", kind: "percent", value: "10", expires: "31/12/2026" }, { code: "OKAY", kind: "percent", value: "10", scope: "course:xyz" }, { code: "bad code!", kind: "percent", value: "10" }])
    assert.ok(!validateCoupon(bad).ok);
});
test("receipt validation", () => {
  assert.equal(validateReceipt("r.jpg", "image/jpeg", 100), null); assert.equal(validateReceipt("r.pdf", "application/pdf", 100), null);
  assert.equal(validateReceipt("r.jpg", "image/jpeg", 6 * 1024 * 1024), "too_large"); assert.equal(validateReceipt("r.exe", "image/jpeg", 10), "type"); assert.equal(validateReceipt("r.gif", "image/gif", 10), "type");
});

test("amounts that do not fit a 32-bit integer column are rejected", () => {
  assert.equal(parseMoneyToMinor("21474836.47"), 2147483647);
  assert.equal(parseMoneyToMinor("21474836.48"), null);
  assert.equal(parseMoneyToMinor("999999999"), null);
});
