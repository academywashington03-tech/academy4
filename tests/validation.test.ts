import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, validateRegister, safeNext, buildSignupMetadata, isStrongPassword } from "../lib/validation.ts";

test("Egyptian mobile numbers normalize to +20", () => {
  assert.equal(normalizePhone("01012345678"), "+201012345678");
  assert.equal(normalizePhone("+20 101 234 5678"), "+201012345678");
  assert.equal(normalizePhone("00201012345678"), "+201012345678");
});
test("invalid phones are rejected", () => {
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("abc"), null);
});
test("registration validation", () => {
  const good = validateRegister({ fullName: "أحمد محمد", email: "A@B.com", phone: "01012345678", password: "abcd1234" });
  assert.ok(good.ok); assert.equal(good.clean?.email, "a@b.com");
  const bad = validateRegister({ fullName: "x", email: "nope", phone: "1", password: "short" });
  assert.ok(!bad.ok); assert.deepEqual(Object.keys(bad.errors).sort(), ["email", "fullName", "password", "phone"]);
});
test("weak passwords rejected", () => {
  assert.ok(!isStrongPassword("12345678")); assert.ok(!isStrongPassword("abcdefgh")); assert.ok(isStrongPassword("abcdefg1"));
});
test("a submitted role can never reach signup metadata", () => {
  const meta = buildSignupMetadata({ fullName: "A B C", email: "a@b.co", phone: "+201012345678", password: "x", role: "super_admin" } as never);
  assert.deepEqual(Object.keys(meta).sort(), ["full_name", "phone"]);
});
test("safeNext blocks open redirects", () => {
  assert.equal(safeNext("/courses"), "/courses");
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "/a\nb"]) assert.equal(safeNext(bad), "/dashboard");
  assert.equal(safeNext(null), "/dashboard");
});
import { safeHttpsUrl, validateAcademy } from "../lib/validation.ts";
test("only https links are accepted for public social links", () => {
  assert.equal(safeHttpsUrl("https://facebook.com/x"), "https://facebook.com/x");
  assert.equal(safeHttpsUrl(""), "");
  for (const bad of ["javascript:alert(1)", "http://x.com", "data:text/html,x", "https://localhost", "not a url", "//evil.com"]) assert.equal(safeHttpsUrl(bad), null, bad);
});
test("academy settings validation", () => {
  assert.ok(validateAcademy({ name: "أكاديمية واشنطن", contact_email: "a@b.co", contact_phone: "+20 100 123 4567", facebook: "https://fb.com/x" }, true).ok);
  for (const bad of [{ name: "x" }, { name: "ok name", contact_email: "bad" }, { name: "ok name", whatsapp: "abc" }, { name: "ok name", youtube: "javascript:1" }])
    assert.ok(!validateAcademy(bad as Record<string, string>, true).ok);
});
import { validateTestimonial, cleanBio } from "../lib/validation.ts";
test("testimonial validation", () => {
  const ok = validateTestimonial({ author_name: "  سارة   أحمد ", body: "دورة ممتازة وشرح واضح جداً", course_title: " " });
  assert.ok(ok.ok); if (ok.ok) { assert.equal(ok.value.author_name, "سارة أحمد"); assert.equal(ok.value.course_title, null); }
  for (const bad of [{ author_name: "x", body: "long enough text here" }, { author_name: "سارة", body: "قصير" }, { author_name: "سارة", body: "x".repeat(601) }, { author_name: "سارة", body: "long enough text here", course_title: "x".repeat(151) }])
    assert.ok(!validateTestimonial(bad).ok);
});
test("bio is trimmed and bounded", () => { assert.equal(cleanBio("  hi \r\n"), "hi"); assert.equal(cleanBio("x".repeat(700)).length, 600); });
import { DEFAULT_POLICIES, POLICY_KINDS, POLICY_TITLES, isPolicyKind, policyKey } from "../lib/policies.ts";
test("policy templates are complete and keys are safe", () => {
  for (const k of POLICY_KINDS) { assert.ok(DEFAULT_POLICIES[k].length > 100, k); assert.ok(POLICY_TITLES[k]); assert.match(policyKey(k), /^public\.policy_[a-z]+$/); assert.ok(!/TODO|lorem/i.test(DEFAULT_POLICIES[k])); }
  assert.ok(isPolicyKind("privacy")); assert.ok(!isPolicyKind("../etc/passwd")); assert.ok(!isPolicyKind("admin"));
  assert.match(DEFAULT_POLICIES.terms, /ليست اعتماداً حكومياً أو جامعياً/);   // never claims accreditation
  assert.match(DEFAULT_POLICIES.privacy, /لا نخزّن بيانات بطاقتك/);
});

import { safeLocalPath, escapeLike } from "../lib/validation.ts";
test("safeNext/safeLocalPath reject every browser-normalised open-redirect form", () => {
  // The WHATWG URL parser drops TAB/CR/LF inside a URL and treats a backslash like a slash, so these all end up as "//evil.com".
  const bypasses = ["/\t/evil.com", "/\r/evil.com", "/\n/evil.com", "/\\evil.com", "/\\/evil.com", "/\u0000/evil.com", "/\u007f/evil.com", "//evil.com", "https://evil.com", "javascript:alert(1)", "", " /x"];
  for (const bad of bypasses) {
    assert.equal(safeLocalPath(bad), null, JSON.stringify(bad));
    assert.equal(safeNext(bad), "/dashboard", JSON.stringify(bad));
    // And whatever is returned must resolve to our own origin.
    assert.equal(new URL(safeNext(bad), "https://site.example").origin, "https://site.example");
  }
  for (const good of ["/", "/courses", "/learn/abc/123?done=1", "/checkout/result?o=1"]) assert.equal(safeLocalPath(good), good);
  assert.equal(safeLocalPath("/" + "a".repeat(3000)), null);
  assert.equal(safeLocalPath(null), null);
});
test("escapeLike makes wildcards literal", () => {
  assert.equal(escapeLike("a_b%c\\d@x.com"), "a\\_b\\%c\\\\d@x.com");
  assert.equal(escapeLike("plain@x.com"), "plain@x.com");
});
