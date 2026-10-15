import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, rateKey } from "../lib/ratelimit-core.ts";

const h = (m: Record<string, string>) => ({ get: (n: string) => m[n.toLowerCase()] ?? null });
test("client IP: first forwarded address, validated", () => {
  assert.equal(clientIp(h({ "x-forwarded-for": "41.65.1.2, 10.0.0.1" })), "41.65.1.2");
  assert.equal(clientIp(h({ "x-real-ip": "2001:db8::1" })), "2001:db8::1");
  assert.equal(clientIp(h({})), "unknown");
  assert.equal(clientIp(h({ "x-forwarded-for": "<script>alert(1)</script>" })), "unknown");   // header injection is not trusted as a key
  assert.equal(clientIp(h({ "x-forwarded-for": "a".repeat(100) })), "unknown");
});
test("rate keys are bounded and sanitized", () => {
  assert.equal(rateKey("login", "1.2.3.4"), "login:1.2.3.4");
  assert.equal(rateKey("lo gin!;", "x"), "login:x");
  assert.ok(rateKey("a", "b".repeat(500)).length <= 200);
});
