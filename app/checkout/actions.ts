"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/supabase/config";
import { UUID_RE, sanitizeFileName, validateReceipt } from "@/lib/course-validation";
import { allow } from "@/lib/ratelimit";
import { buildIntentionBody, checkoutUrl, createIntention, paymobConfig } from "@/lib/paymob";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

type Target = { kind: "course" | "bundle"; id: string; slug: string; coupon: string; back: (e: string) => never };
function readTarget(form: FormData): Target {
  const kind = str(form, "kind") === "bundle" ? "bundle" : "course";
  const id = str(form, "id"); const slug = str(form, "slug"); const coupon = str(form, "coupon").trim().slice(0, 40);
  if (!UUID_RE.test(id) || !/^[a-z0-9-]{1,80}$/.test(slug)) redirect("/courses");
  const base = kind === "bundle" ? `/checkout/bundle/${slug}` : `/checkout/${slug}`;
  return { kind, id, slug, coupon, back: (e) => redirect(`${base}?error=${e}${coupon ? `&coupon=${encodeURIComponent(coupon)}` : ""}`) };
}
/** Maps DB exception text to a safe code for the UI. */
const code = (m: string) => (["coupon_invalid", "coupon_used", "coupon_exhausted", "manual payments disabled"].find((c) => m.includes(c)) ?? "unavailable").replace(/ /g, "_");

async function makeOrder(t: Target, method: "online" | "manual") {
  const s = await getSessionProfile();
  if (!s || s.suspended) redirect(`/login?next=${encodeURIComponent("/courses")}`);
  if (!(await allow("order", 20, 600, s.id))) return t.back("rate");
  const sb = await createClient();
  // The DATABASE prices the order (item + coupon). The browser sends no amount.
  const { data, error } = await sb.rpc("create_order", { p_course: t.kind === "course" ? t.id : null, p_bundle: t.kind === "bundle" ? t.id : null, p_method: method, p_coupon: t.coupon || null });
  if (error || !data) {
    if (error?.message.includes("already enrolled")) redirect(t.kind === "course" ? `/learn/${t.slug}` : "/dashboard");
    return t.back(code(error?.message ?? ""));
  }
  return { s, sb, orderId: data as string };
}

export async function startOnlinePayment(form: FormData) {
  const t = readTarget(form);
  const cfg = paymobConfig();
  if (!cfg) return t.back("not_configured");        // never simulate a payment
  // A live site must know its own public https address: Paymob posts the payment result to it. Fail closed instead of
  // sending customers to pay when the notification could never arrive (e.g. NEXT_PUBLIC_SITE_URL left at its localhost default).
  if (process.env.NODE_ENV === "production" && !/^https:\/\/(?!localhost|127\.|0\.0\.0\.0)/i.test(SITE_URL)) return t.back("not_configured");
  // Check the customer's profile BEFORE creating an order, so an incomplete profile does not leave a stray pending order.
  const pre = await getSessionProfile();
  if (!pre || pre.suspended) redirect(`/login?next=${encodeURIComponent("/courses")}`);
  const { data: pp } = await (await createClient()).from("profiles").select("phone").eq("id", pre.id).single();
  if (!pp?.phone || !pre.email) return t.back("profile");
  const { s, sb, orderId } = await makeOrder(t, "online");
  const { data: o } = await sb.from("orders").select("id, total_minor, currency, status").eq("id", orderId).single();
  const { data: p } = await sb.from("profiles").select("full_name, phone").eq("id", s.id).single();
  const title = t.kind === "course" ? (await sb.from("public_courses").select("title").eq("id", t.id).maybeSingle()).data?.title : (await sb.from("bundles").select("title").eq("id", t.id).maybeSingle()).data?.title;
  if (!o || o.status !== "pending" || !title) return t.back("unavailable");
  if (!p?.phone || !s.email) return t.back("profile");
  const [first, ...rest] = (p.full_name || "NA").split(" ");
  let url: string;
  try {
    const intent = await createIntention(cfg, buildIntentionBody({
      amountMinor: o.total_minor, currency: o.currency, orderId: o.id, title, integrationId: cfg.integrationId,
      customer: { firstName: first, lastName: rest.join(" ") || "NA", email: s.email, phone: p.phone },
      notificationUrl: `${SITE_URL}/api/webhooks/paymob`, redirectionUrl: `${SITE_URL}/checkout/result?o=${o.id}`,
    }));
    await createServiceClient().from("orders").update({ provider: "paymob", provider_ref: intent.id }).eq("id", o.id);
    url = checkoutUrl(cfg, intent.clientSecret);
  } catch { return t.back("gateway"); }
  redirect(url);   // Access is granted ONLY by the verified webhook.
}

export async function startManualPayment(form: FormData) {
  const t = readTarget(form);
  const { orderId } = await makeOrder(t, "manual");
  redirect(`/checkout/manual/${orderId}`);
}

// ---- Receipt upload (browser -> private bucket with a server-issued token) + submission ----
export type ReceiptPrep = { ok: true; path: string; token: string } | { ok: false; error: string };
export async function prepareReceiptUpload(orderId: string, fileName: string, mime: string, size: number): Promise<ReceiptPrep> {
  const s = await getSessionProfile();
  if (!s || s.suspended || !UUID_RE.test(orderId)) return { ok: false, error: "forbidden" };
  const bad = validateReceipt(fileName, mime, size);
  if (bad) return { ok: false, error: bad };
  const sb = await createClient();
  const { data: o } = await sb.from("orders").select("id").eq("id", orderId).eq("user_id", s.id).eq("method", "manual").maybeSingle();
  if (!o) return { ok: false, error: "forbidden" };
  const path = `${s.id}/${orderId}-${randomUUID()}-${sanitizeFileName(fileName)}`;
  const { data, error } = await sb.storage.from("payment-receipts").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "failed" };
  return { ok: true, path, token: data.token };
}

export async function submitManualPayment(orderId: string, reference: string, receiptPath: string | null): Promise<{ ok: boolean; error?: string }> {
  const s = await getSessionProfile();
  if (!s || s.suspended || !UUID_RE.test(orderId)) return { ok: false, error: "forbidden" };
  if (!(await allow("manual_submit", 10, 3600, s.id))) return { ok: false, error: "rate" };
  const { error } = await (await createClient()).rpc("submit_manual_payment", { p_order: orderId, p_reference: reference, p_receipt: receiptPath });
  return error ? { ok: false, error: error.message.includes("reference") ? "reference" : "failed" } : { ok: true };
}
