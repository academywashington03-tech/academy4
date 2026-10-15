import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { hmacString } from "../lib/paymob.ts";
import { handlePaymobCallback, type Rpc } from "../lib/payments/webhook.ts";

const ORDER = "11111111-2222-3333-4444-555555555555";
const obj = (over: Record<string, unknown> = {}) => ({
  id: 1, pending: false, amount_cents: 15000, success: true, is_auth: false, is_capture: false, is_standalone_payment: true, is_voided: false,
  is_refunded: false, is_3d_secure: true, integration_id: 9, has_parent_transaction: false, order: { id: 5, merchant_order_id: ORDER },
  created_at: "2026-10-12T10:00:00", currency: "EGP", error_occured: false, owner: 3, source_data: { pan: "2346", type: "card", sub_type: "Visa" }, ...over,
});
const sig = (o: unknown) => createHmac("sha512", "S").update(hmacString(o)).digest("hex");
function stub(ret: { data?: unknown; error?: { message: string } | null } = { data: "fulfilled", error: null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => { calls.push({ fn, args }); return { data: ret.data ?? null, error: ret.error ?? null }; };
  return { calls, rpc };
}

test("TEST 8: unsigned / forged events never reach the database", async () => {
  const s = stub();
  for (const hmac of [null, "", "deadbeef", sig(obj({ amount_cents: 1 }))]) {
    const r = await handlePaymobCallback({ body: { type: "TRANSACTION", obj: obj() }, hmac, secret: "S", rpc: s.rpc });
    assert.equal(r.status, 401);
  }
  assert.equal(s.calls.length, 0);
});
test("missing secret => not configured, nothing processed", async () => {
  const s = stub(); const o = obj();
  const r = await handlePaymobCallback({ body: { type: "TRANSACTION", obj: o }, hmac: sig(o), secret: undefined, rpc: s.rpc });
  assert.equal(r.status, 503); assert.equal(s.calls.length, 0);
});
test("malformed bodies are rejected", async () => {
  const s = stub();
  for (const body of [null, "x", {}, { type: "TRANSACTION" }]) assert.equal((await handlePaymobCallback({ body, hmac: "x", secret: "S", rpc: s.rpc })).status, 400);
  assert.equal(s.calls.length, 0);
});
test("TEST 9: a verified success is forwarded with amounts taken from the signed payload", async () => {
  const s = stub(); const o = obj();
  const r = await handlePaymobCallback({ body: { type: "TRANSACTION", obj: o }, hmac: sig(o), secret: "S", rpc: s.rpc });
  assert.deepEqual(r, { status: 200, result: "fulfilled" });
  assert.equal(s.calls.length, 1); assert.equal(s.calls[0].fn, "process_online_payment");
  assert.equal(s.calls[0].args.p_order, ORDER); assert.equal(s.calls[0].args.p_amount, 15000); assert.equal(s.calls[0].args.p_success, true);
});
test("TEST 10: a duplicate delivery is acknowledged (200) and the DB reports duplicate", async () => {
  const s = stub({ data: "duplicate" }); const o = obj();
  const r1 = await handlePaymobCallback({ body: { type: "TRANSACTION", obj: o }, hmac: sig(o), secret: "S", rpc: s.rpc });
  const r2 = await handlePaymobCallback({ body: { type: "TRANSACTION", obj: o }, hmac: sig(o), secret: "S", rpc: s.rpc });
  assert.equal(r1.status, 200); assert.equal(r2.result, "duplicate");
});
test("TEST 11: failed payments are forwarded as failed (DB never grants access)", async () => {
  const s = stub({ data: "failed" }); const o = obj({ success: false, error_occured: true });
  const r = await handlePaymobCallback({ body: { type: "TRANSACTION", obj: o }, hmac: sig(o), secret: "S", rpc: s.rpc });
  assert.equal(r.result, "failed"); assert.equal(s.calls[0].args.p_success, false);
});
test("database failure returns 500 so the provider retries", async () => {
  const s = stub({ error: { message: "boom" } }); const o = obj();
  assert.equal((await handlePaymobCallback({ body: { type: "TRANSACTION", obj: o }, hmac: sig(o), secret: "S", rpc: s.rpc })).status, 500);
});
test("non-transaction callbacks and unknown references are acknowledged but not processed", async () => {
  const s = stub(); const o = obj();
  assert.equal((await handlePaymobCallback({ body: { type: "TOKEN", obj: o }, hmac: sig(o), secret: "S", rpc: s.rpc })).result, "ignored_type");
  const o2 = obj({ order: { id: 5 } });
  assert.equal((await handlePaymobCallback({ body: { type: "TRANSACTION", obj: o2 }, hmac: sig(o2), secret: "S", rpc: s.rpc })).result, "ignored_unrecognized");
  assert.equal(s.calls.length, 0);
});
