import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "../lib/authz.ts";

test("public pages are open to everyone", () => {
  assert.equal(decide(null, false, "/"), "allow");
  assert.equal(decide(null, false, "/courses/x"), "allow");
  assert.equal(decide(null, false, "/verify/ABC"), "allow");
});
test("anonymous visitors are sent to login for protected pages", () => {
  for (const p of ["/dashboard", "/admin", "/learn/a/b", "/admin/courses"]) assert.equal(decide(null, false, p), "login");
});
test("TEST 2: a student cannot open admin pages", () => {
  for (const p of ["/admin", "/admin/courses", "/admin/orders", "/admin/settings"]) assert.equal(decide("student", false, p), "forbidden");
});
test("students can open their own area", () => {
  assert.equal(decide("student", false, "/dashboard"), "allow");
  assert.equal(decide("student", false, "/learn/c/l"), "allow");
});
test("instructors reach course tools but not payments/settings/students", () => {
  assert.equal(decide("instructor", false, "/admin"), "allow");
  assert.equal(decide("instructor", false, "/admin/courses"), "allow");
  for (const p of ["/admin/orders", "/admin/settings", "/admin/manual-payments", "/admin/coupons", "/admin/students", "/admin/audit-log"])
    assert.equal(decide("instructor", false, p), "forbidden");
});
test("super admin can open everything", () => {
  for (const p of ["/admin", "/admin/orders", "/admin/settings", "/dashboard"]) assert.equal(decide("super_admin", false, p), "allow");
});
test("suspended accounts are blocked from protected pages", () => {
  assert.equal(decide("student", true, "/dashboard"), "forbidden");
  assert.equal(decide("super_admin", true, "/admin"), "forbidden");
});
test("path-prefix tricks do not bypass admin rules", () => {
  assert.equal(decide("student", false, "/administrator"), "allow"); // not an admin path, not protected
  assert.equal(decide("instructor", false, "/admin/orders/123"), "forbidden");
});
test("instructors cannot create courses or manage categories", () => {
  assert.equal(decide("instructor", false, "/admin/courses/new"), "forbidden");
  assert.equal(decide("instructor", false, "/admin/categories"), "forbidden");
  assert.equal(decide("instructor", false, "/admin/courses/abc"), "allow");
  assert.equal(decide("super_admin", false, "/admin/courses/new"), "allow");
});
test("instructors cannot manage testimonials", () => {
  assert.equal(decide("instructor", false, "/admin/testimonials"), "forbidden");
  assert.equal(decide("super_admin", false, "/admin/testimonials"), "allow");
});
