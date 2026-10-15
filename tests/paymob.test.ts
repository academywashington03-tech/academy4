import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { HMAC_FIELDS, hmacString, verifyHmac, parseTransaction, extractOrderRef, buildIntentionBody, checkoutUrl, paymobConfig } from "../lib/paymob.ts";

const ORDER = "11111111-2222-3333-4444-555555555555";
const obj = () => ({
  id: 192036465, pending: false, amount_cents: 15000, success: true, is_auth: false, is_capture: false, is_standalone_payment: true,
  is_voided: false, is_refunded: false, is_3d_secure: true, integration_id: 4097558, has_parent_transaction: false,
  order: { id: 217503754, merchant_order_id: ORDER }, created_at: "2026-10-12T10:00:00.123456", currency: "EGP", error_occured: false, owner: 302852,
  source_data: { pan: "2346", type: "card", sub_type: "MasterCard" },
});
const sign = (o: unknown, s: string) => createHmac("sha512", s).update(hmacString(o)).digest("hex");

test("HMAC uses the 20 documented fields in the documented order", () => {
  assert.equal(HMAC_FIELDS.length, 20);
  assert.deepEqual([...HMAC_FIELDS].slice(0, 6), ["amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id"]);
  // is_3d_secure, is_auth, is_capture, is_refunded, is_standalone_payment, is_voided = true,false,false,false,true,false
  assert.equal(hmacString(obj()),
    "15000" + "2026-10-12T10:00:00.123456" + "EGP" + "false" + "false" + "192036465" + "4097558" +
    "true" + "false" + "false" + "false" + "true" + "false" + "217503754" + "302852" + "false" + "2346" + "MasterCard" + "card" + "true");
});
test("valid signature passes; any tampering fails", () => {
  const o = obj(); const h = sign(o, "secret");
  assert.ok(verifyHmac(o, h, "secret"));
  assert.ok(verifyHmac(o, h.toUpperCase(), "secret"));
  assert.ok(!verifyHmac(o, h, "other-secret"));
  assert.ok(!verifyHmac({ ...o, amount_cents: 100 }, h, "secret"));      // amount changed
  assert.ok(!verifyHmac({ ...o, success: false }, h, "secret"));         // status changed
  assert.ok(!verifyHmac({ ...o, order: { ...o.order, id: 1 } }, h, "secret"));
  assert.ok(!verifyHmac(o, "", "secret")); assert.ok(!verifyHmac(o, null, "secret")); assert.ok(!verifyHmac(o, h, undefined));
  assert.ok(!verifyHmac(o, h.slice(0, 10), "secret"));                    // length mismatch must not throw
});
test("transaction parsing", () => {
  const t = parseTransaction(obj())!;
  assert.deepEqual(t, { txnId: "192036465", orderRef: ORDER, amountCents: 15000, currency: "EGP", success: true, pending: false, refunded: false, voided: false, authOnly: false });
  assert.equal(parseTransaction({ ...obj(), order: { id: 1 } }), null);                 // no order reference
  assert.equal(parseTransaction({ ...obj(), amount_cents: "abc" }), null);
  assert.equal(parseTransaction({ ...obj(), is_auth: true, is_capture: false })!.authOnly, true);
  assert.equal(extractOrderRef({ order: { merchant_order_id: `${ORDER}_x` } }), ORDER);
  assert.equal(extractOrderRef({ order: { merchant_order_id: "not-a-uuid" } }), null);
});
test("intention body: integer amount, our order id as reference", () => {
  const b = buildIntentionBody({ amountMinor: 15000, currency: "EGP", orderId: ORDER, title: "Course", integrationId: 123,
    customer: { firstName: "A", lastName: "B", email: "a@b.co", phone: "+201012345678" }, notificationUrl: "https://x/api", redirectionUrl: "https://x/r" });
  assert.equal(b.amount, 15000); assert.equal(b.items[0].amount, 15000); assert.equal(b.special_reference, ORDER);
  assert.deepEqual(b.payment_methods, [123]); assert.equal(b.billing_data.phone_number, "+201012345678");
  assert.throws(() => buildIntentionBody({ ...{ amountMinor: 1.5 }, currency: "EGP", orderId: ORDER, title: "x", integrationId: 1, customer: { firstName: "", lastName: "", email: "", phone: "" }, notificationUrl: "", redirectionUrl: "" }));
});
test("checkout URL and config", () => {
  assert.equal(checkoutUrl({ baseUrl: "https://accept.paymob.com", publicKey: "pk 1" }, "cs&2"), "https://accept.paymob.com/unifiedcheckout/?publicKey=pk%201&clientSecret=cs%262");
  assert.equal(paymobConfig({} as never), null);
  assert.ok(paymobConfig({ PAYMOB_SECRET_KEY: "s", PAYMOB_PUBLIC_KEY: "p", PAYMOB_INTEGRATION_ID: "12" } as never));
});
