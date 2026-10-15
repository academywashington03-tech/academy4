"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sendPendingEmails } from "@/lib/outbox";
import { adminCtx, audit, fid, fstr, go } from "@/lib/admin-helpers";
import { UUID_RE, isValidSlug, parseMoneyToMinor, validateCoupon } from "@/lib/course-validation";

// ---------- Coupons ----------
export async function saveCoupon(form: FormData) {
  const { sb } = await adminCtx("/admin/coupons");
  const v = validateCoupon({ code: fstr(form, "code"), kind: fstr(form, "kind"), value: fstr(form, "value"), expires: fstr(form, "expires"), max: fstr(form, "max"), scope: fstr(form, "scope") });
  if (!v.ok) go("/admin/coupons", "error", `c_${v.error}`);
  const { error } = await sb.from("coupons").insert((v as { clean: object }).clean);
  if (error) go("/admin/coupons", "error", error.code === "23505" ? "c_dup" : "failed");
  await audit(sb, "coupon_created", "coupon", (v as { clean: { code: string } }).clean.code);
  go("/admin/coupons", "ok", "saved");
}
export async function toggleCoupon(form: FormData) {
  const { sb } = await adminCtx("/admin/coupons"); const id = fid(form, "id");
  await sb.from("coupons").update({ active: fstr(form, "active") === "1" }).eq("id", id);
  await audit(sb, "coupon_toggled", "coupon", id, { active: fstr(form, "active") === "1" });
  go("/admin/coupons", "ok", "saved");
}
export async function deleteCoupon(form: FormData) {
  const { sb } = await adminCtx("/admin/coupons"); const id = fid(form, "id");
  const { count } = await sb.from("orders").select("id", { count: "exact", head: true }).eq("coupon_id", id);
  if (count) go("/admin/coupons", "error", "c_used");           // keep history: deactivate instead
  await sb.from("coupons").delete().eq("id", id);
  await audit(sb, "coupon_deleted", "coupon", id);
  go("/admin/coupons", "ok", "deleted");
}

// ---------- Bundles (period_days set => prepaid subscription period) ----------
export async function saveBundle(form: FormData) {
  const { sb } = await adminCtx("/admin/bundles");
  const id = fstr(form, "id"); const title = fstr(form, "title").trim().slice(0, 150);
  const slug = fstr(form, "slug").trim().toLowerCase(); const price = parseMoneyToMinor(fstr(form, "price"));
  const periodRaw = fstr(form, "period_days").trim(); const period = periodRaw ? Number(periodRaw) : null;
  const status = ["draft", "published", "archived"].includes(fstr(form, "status")) ? fstr(form, "status") : "draft";
  const courseIds = form.getAll("course_ids").map(String).filter((x) => UUID_RE.test(x));
  if (title.length < 3 || !isValidSlug(slug) || !price || price <= 0) go("/admin/bundles", "error", "b_invalid");
  if (period !== null && (!Number.isInteger(period) || period < 1 || period > 3650)) go("/admin/bundles", "error", "b_invalid");
  if (status === "published" && courseIds.length === 0) go("/admin/bundles", "error", "b_empty");
  const row = { title, slug, description: fstr(form, "description").trim().slice(0, 5000), price_minor: price, period_days: period, status };
  let bundleId = id;
  if (UUID_RE.test(id)) {
    const { error } = await sb.from("bundles").update(row).eq("id", id);
    if (error) go("/admin/bundles", "error", error.code === "23505" ? "slug_taken" : "failed");
  } else {
    const { data, error } = await sb.from("bundles").insert(row).select("id").single();
    if (error || !data) go("/admin/bundles", "error", error?.code === "23505" ? "slug_taken" : "failed");
    bundleId = data!.id;
  }
  await sb.from("bundle_courses").delete().eq("bundle_id", bundleId);
  if (courseIds.length) await sb.from("bundle_courses").insert(courseIds.map((c) => ({ bundle_id: bundleId, course_id: c })));
  await audit(sb, "bundle_saved", "bundle", bundleId, { status, courses: courseIds.length });
  revalidatePath("/courses");
  go("/admin/bundles", "ok", "saved");
}
export async function deleteBundle(form: FormData) {
  const { sb } = await adminCtx("/admin/bundles"); const id = fid(form, "id");
  const { count } = await sb.from("orders").select("id", { count: "exact", head: true }).eq("bundle_id", id);
  if (count) go("/admin/bundles", "error", "b_used");           // has orders: archive instead
  await sb.from("bundles").delete().eq("id", id);
  await audit(sb, "bundle_deleted", "bundle", id);
  go("/admin/bundles", "ok", "deleted");
}

// ---------- Manual payments ----------
export async function approveManual(form: FormData) {
  const { sb } = await adminCtx("/admin/manual-payments"); const id = fid(form, "id");
  const { error } = await sb.rpc("approve_manual_order", { p_order: id });   // fulfillment runs in the same DB transaction
  if (error) go("/admin/manual-payments", "error", "m_state");
  after(() => sendPendingEmails(5));
  go("/admin/manual-payments", "ok", "m_approved");
}
export async function rejectManual(form: FormData) {
  const { sb } = await adminCtx("/admin/manual-payments"); const id = fid(form, "id");
  const { error } = await sb.rpc("reject_manual_order", { p_order: id, p_reason: fstr(form, "reason") });
  if (error) go("/admin/manual-payments", "error", "m_state");
  after(() => sendPendingEmails(5));
  go("/admin/manual-payments", "ok", "m_rejected");
}

// ---------- Manual-payment settings (academy/certificate settings live in ops-actions.ts and cert-actions.ts) ----------
export async function saveManualSettings(form: FormData) {
  const { sb } = await adminCtx("/admin/settings");
  const value = { enabled: form.get("enabled") === "on", instructions: fstr(form, "instructions").trim().slice(0, 3000) };
  const { error } = await sb.from("settings").upsert({ key: "public.manual_payments", value });
  if (error) go("/admin/settings", "error", "failed");
  await audit(sb, "settings_changed", "settings", "public.manual_payments", { enabled: value.enabled });
  go("/admin/settings", "ok", "saved");
}
