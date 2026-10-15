"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminCtx, audit, fid, fstr, go } from "@/lib/admin-helpers";
import { UUID_RE, toLatinDigits } from "@/lib/course-validation";
import { cleanBio, validateAcademy, validateTestimonial } from "@/lib/validation";
import { sendPendingEmails } from "@/lib/outbox";
import { POLICY_KINDS, policyKey } from "@/lib/policies";

// ---------- Student management (super_admin) ----------
export async function grantAccess(form: FormData) {
  const { sb } = await adminCtx("/admin/students"); const user = fid(form, "user_id"); const course = fid(form, "course_id");
  const back = `/admin/students/${user}`;
  const daysRaw = fstr(form, "days").trim(); const days = daysRaw ? Number(toLatinDigits(daysRaw)) : null;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) go(back, "error", "g_days");
  const { error } = await sb.rpc("admin_grant_access", { p_user: user, p_course: course, p_days: days, p_reason: fstr(form, "reason") });
  if (error) go(back, "error", "failed");
  after(() => sendPendingEmails(3));
  go(back, "ok", "g_granted");
}
export async function revokeAccess(form: FormData) {
  const { sb } = await adminCtx("/admin/students"); const user = fid(form, "user_id");
  const { error } = await sb.rpc("admin_revoke_access", { p_enrollment: fid(form, "enrollment_id"), p_reason: fstr(form, "reason") });
  if (error) go(`/admin/students/${user}`, "error", "failed");
  go(`/admin/students/${user}`, "ok", "g_revoked");
}
export async function setSuspended(form: FormData) {
  const { sb } = await adminCtx("/admin/students"); const user = fid(form, "user_id"); const flag = fstr(form, "flag") === "1";
  const { error } = await sb.rpc("admin_set_suspended", { p_user: user, p_flag: flag, p_reason: fstr(form, "reason") });
  if (error) go(`/admin/students/${user}`, "error", error.message.includes("administrator") ? "protected" : "failed");
  go(`/admin/students/${user}`, "ok", flag ? "g_suspended" : "g_reactivated");
}

// ---------- Announcements (admin: platform-wide or any course; instructor: own courses; the DB enforces it) ----------
export async function publishAnnouncement(form: FormData) {
  await requirePath("/admin/announcements");
  const scope = fstr(form, "scope"); const course = scope === "platform" ? null : scope;
  if (course !== null && !UUID_RE.test(course)) redirect("/admin/announcements?error=ann_invalid");
  const { data, error } = await (await createClient()).rpc("publish_announcement", { p_course: course, p_title: fstr(form, "title"), p_body: fstr(form, "body"), p_email: form.get("email") === "on" });
  if (error) redirect(`/admin/announcements?error=${error.message.includes("invalid") ? "ann_invalid" : "failed"}`);
  after(() => sendPendingEmails(25));
  redirect(`/admin/announcements?ok=ann_sent&n=${Number(data) || 0}`);
}

// ---------- Academy settings (super_admin) ----------
export async function saveAcademySettings(form: FormData) {
  const { sb } = await adminCtx("/admin/settings");
  const raw: Record<string, string> = {}; for (const k of ["name", "contact_email", "contact_phone", "whatsapp", "facebook", "instagram", "youtube"]) raw[k] = fstr(form, k);
  const v = validateAcademy(raw, form.get("registration_open") === "on");
  if (!v.ok) go("/admin/settings", "error", (v as { error: string }).error);
  const { error } = await sb.from("settings").upsert({ key: "public.academy", value: (v as { value: object }).value });
  if (error) go("/admin/settings", "error", "failed");
  await audit(sb, "settings_changed", "settings", "public.academy", { registration_open: (v as { value: { registration_open: boolean } }).value.registration_open });
  go("/admin/settings", "ok", "saved");
}

// ---------- Homepage content (super_admin) ----------
export async function saveTestimonial(form: FormData) {
  const { sb } = await adminCtx("/admin/testimonials");
  const v = validateTestimonial({ author_name: fstr(form, "author_name"), body: fstr(form, "body"), course_title: fstr(form, "course_title") });
  if (!v.ok) go("/admin/testimonials", "error", (v as { error: string }).error);
  const { error } = await sb.from("testimonials").insert({ ...(v as { value: object }).value, published: form.get("published") === "on" });
  if (error) go("/admin/testimonials", "error", "failed");
  await audit(sb, "testimonial_created", "testimonial", "new");
  go("/admin/testimonials", "ok", "saved");
}
export async function toggleTestimonial(form: FormData) {
  const { sb } = await adminCtx("/admin/testimonials"); const id = fid(form, "id");
  await sb.from("testimonials").update({ published: fstr(form, "published") === "1" }).eq("id", id);
  await audit(sb, "testimonial_toggled", "testimonial", id);
  go("/admin/testimonials", "ok", "saved");
}
export async function deleteTestimonial(form: FormData) {
  const { sb } = await adminCtx("/admin/testimonials"); const id = fid(form, "id");
  await sb.from("testimonials").delete().eq("id", id);
  await audit(sb, "testimonial_deleted", "testimonial", id);
  go("/admin/testimonials", "ok", "deleted");
}
export async function setInstructorBio(form: FormData) {
  const { sb } = await adminCtx("/admin/instructors"); const id = fid(form, "id");
  const { error } = await sb.from("profiles").update({ bio: cleanBio(fstr(form, "bio")) || null }).eq("id", id).eq("role", "instructor");
  if (error) go("/admin/instructors", "error", "failed");
  await audit(sb, "instructor_bio_saved", "profile", id);
  go("/admin/instructors", "ok", "bio_saved");
}

// ---------- Policy pages (super_admin): privacy / terms / refund ----------
export async function savePolicies(form: FormData) {
  const { sb } = await adminCtx("/admin/settings");
  for (const k of POLICY_KINDS) {
    const text = fstr(form, `policy_${k}`).replace(/\r/g, "").trim().slice(0, 20000);
    const { error } = text ? await sb.from("settings").upsert({ key: policyKey(k), value: { text } }) : await sb.from("settings").delete().eq("key", policyKey(k));
    if (error) go("/admin/settings", "error", "failed");
  }
  await audit(sb, "settings_changed", "settings", "public.policies");
  go("/admin/settings", "ok", "saved");
}
