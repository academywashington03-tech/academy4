// Paymob (Egypt) helpers: Intention API + processed-callback HMAC.
// Verified against Paymob's published docs: POST /v1/intention/ with "Authorization: Token <secret key>",
// Unified Checkout URL, and the 20-field HMAC-SHA512 concatenation for the transaction processed callback.
import { createHmac, timingSafeEqual } from "node:crypto";

export const HMAC_FIELDS = [
  "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id",
  "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided", "order.id",
  "owner", "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success",
] as const;

type Json = Record<string, unknown>;
const dig = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Json)[k] : undefined), o);

/** Values are concatenated as their JSON text form (true/false, numbers). Missing/null -> empty string. */
export function hmacString(obj: unknown): string {
  return HMAC_FIELDS.map((f) => { const v = dig(obj, f); return v === undefined || v === null ? "" : String(v); }).join("");
}

export function verifyHmac(obj: unknown, received: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !received) return false;
  const expected = Buffer.from(createHmac("sha512", secret).update(hmacString(obj)).digest("hex"));
  const got = Buffer.from(received.toLowerCase());
  return expected.length === got.length && timingSafeEqual(expected, got);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Our order id comes back as the intention's special_reference (order.merchant_order_id) or our extras value. */
export function extractOrderRef(obj: unknown): string | null {
  const cands = [dig(obj, "order.merchant_order_id"), dig(obj, "payment_key_claims.extra.merchant_intention_id"), dig(obj, "payment_key_claims.extra.special_reference")];
  for (const c of cands) if (typeof c === "string") { const id = c.split("_")[0]; if (UUID.test(c)) return c; if (UUID.test(id)) return id; }
  return null;
}

export type ParsedTxn = { txnId: string; orderRef: string; amountCents: number; currency: string; success: boolean; pending: boolean; refunded: boolean; voided: boolean; authOnly: boolean };
export function parseTransaction(obj: unknown): ParsedTxn | null {
  const o = obj as Json; const ref = extractOrderRef(obj);
  const amount = Number(o?.amount_cents);
  if (!o || o.id === undefined || o.id === null || !ref || !Number.isInteger(amount) || amount < 0 || typeof o.currency !== "string") return null;
  return {
    txnId: String(o.id), orderRef: ref, amountCents: amount, currency: o.currency.toUpperCase(),
    success: o.success === true, pending: o.pending === true, refunded: o.is_refunded === true, voided: o.is_voided === true,
    authOnly: o.is_auth === true && o.is_capture !== true,
  };
}

export type PaymobConfig = { secretKey: string; publicKey: string; integrationId: number; baseUrl: string };
export function paymobConfig(env = process.env): PaymobConfig | null {
  const secretKey = env.PAYMOB_SECRET_KEY, publicKey = env.PAYMOB_PUBLIC_KEY, integ = Number(env.PAYMOB_INTEGRATION_ID);
  if (!secretKey || !publicKey || !Number.isInteger(integ) || integ <= 0) return null;
  return { secretKey, publicKey, integrationId: integ, baseUrl: env.PAYMOB_BASE_URL || "https://accept.paymob.com" };
}

export type IntentionInput = {
  amountMinor: number; currency: string; orderId: string; title: string; integrationId: number;
  customer: { firstName: string; lastName: string; email: string; phone: string };
  notificationUrl: string; redirectionUrl: string;
};
export function buildIntentionBody(i: IntentionInput) {
  if (!Number.isInteger(i.amountMinor) || i.amountMinor <= 0) throw new Error("invalid amount");
  return {
    amount: i.amountMinor, currency: i.currency, payment_methods: [i.integrationId],
    items: [{ name: i.title.slice(0, 50) || "Course", amount: i.amountMinor, description: i.title.slice(0, 120), quantity: 1 }],
    billing_data: {
      first_name: i.customer.firstName || "NA", last_name: i.customer.lastName || "NA", email: i.customer.email, phone_number: i.customer.phone,
      country: "EG", city: "NA", state: "NA", street: "NA", building: "NA", floor: "NA", apartment: "NA",
    },
    special_reference: i.orderId, extras: { merchant_intention_id: i.orderId },
    notification_url: i.notificationUrl, redirection_url: i.redirectionUrl,
  };
}

export const checkoutUrl = (cfg: Pick<PaymobConfig, "baseUrl" | "publicKey">, clientSecret: string) =>
  `${cfg.baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(cfg.publicKey)}&clientSecret=${encodeURIComponent(clientSecret)}`;

export async function createIntention(cfg: PaymobConfig, body: ReturnType<typeof buildIntentionBody>): Promise<{ id: string; clientSecret: string }> {
  const res = await fetch(`${cfg.baseUrl}/v1/intention/`, {
    method: "POST", headers: { Authorization: `Token ${cfg.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000), cache: "no-store",
  });
  if (!res.ok) throw new Error(`paymob_http_${res.status}`);
  const j = (await res.json()) as { id?: string | number; client_secret?: string };
  if (!j.client_secret) throw new Error("paymob_no_client_secret");
  return { id: String(j.id ?? ""), clientSecret: j.client_secret };
}
