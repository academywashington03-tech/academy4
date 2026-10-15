// Framework-free webhook core so it can be unit-tested. The route injects the secret and the DB call.
import { parseTransaction, verifyHmac } from "../paymob.ts";

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
export type WebhookResult = { status: number; result: string };

export async function handlePaymobCallback(i: { body: unknown; hmac: string | null; secret: string | undefined; rpc: Rpc }): Promise<WebhookResult> {
  if (!i.secret) return { status: 503, result: "not_configured" };
  const b = i.body as { type?: string; obj?: unknown } | null;
  if (!b || typeof b !== "object" || !b.obj || typeof b.obj !== "object") return { status: 400, result: "bad_payload" };
  // Authenticate FIRST. Nothing below runs for an unauthenticated request.
  if (!verifyHmac(b.obj, i.hmac, i.secret)) return { status: 401, result: "invalid_signature" };
  if (b.type !== "TRANSACTION") return { status: 200, result: "ignored_type" };
  const t = parseTransaction(b.obj);
  if (!t) return { status: 200, result: "ignored_unrecognized" }; // authentic but not one of our orders: stop retries
  const { data, error } = await i.rpc("process_online_payment", {
    p_provider: "paymob", p_txn_id: t.txnId, p_order: t.orderRef, p_amount: t.amountCents, p_currency: t.currency,
    p_success: t.success, p_pending: t.pending, p_refunded: t.refunded, p_voided: t.voided, p_auth_only: t.authOnly, p_raw: b.obj,
  });
  if (error) return { status: 500, result: "processing_error" };   // non-2xx so the provider can retry
  return { status: 200, result: typeof data === "string" ? data : "ok" };
}
