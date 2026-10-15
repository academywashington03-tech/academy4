"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sendPendingEmails } from "@/lib/outbox";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { UUID_RE } from "@/lib/course-validation";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const slugOk = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 80;

/** Free courses only. The database function re-checks: published, free, open, not revoked. */
export async function enrollFree(form: FormData) {
  const courseId = str(form, "course_id"); const slug = str(form, "slug");
  if (!UUID_RE.test(courseId) || !slugOk(slug)) redirect("/courses");
  const s = await getSessionProfile();
  if (!s || s.suspended) redirect(`/login?next=${encodeURIComponent(`/courses/${slug}`)}`);
  const { error } = await (await createClient()).rpc("enroll_free", { p_course: courseId });
  if (error) redirect(`/courses/${slug}?error=unavailable`);
  revalidatePath("/dashboard");
  after(() => sendPendingEmails(5));
  redirect(`/learn/${slug}`);
}

export async function completeLesson(form: FormData) {
  const lessonId = str(form, "lesson_id"); const slug = str(form, "slug"); const next = str(form, "next");
  if (!UUID_RE.test(lessonId) || !slugOk(slug)) redirect("/dashboard");
  const s = await getSessionProfile();
  if (!s || s.suspended) redirect(`/login?next=${encodeURIComponent(`/learn/${slug}/${lessonId}`)}`);
  const { error } = await (await createClient()).rpc("mark_lesson_complete", { p_lesson: lessonId });
  if (error) redirect(`/learn/${slug}/${lessonId}?error=failed`);
  revalidatePath("/dashboard");
  // If this completed the course requirements, issue the certificate (the DB decides; null = not eligible).
  const sb = await createClient();
  const { data: l } = await sb.from("lessons").select("course_id").eq("id", lessonId).maybeSingle();
  const cert = l ? (await sb.rpc("try_issue_certificate", { p_course: l.course_id })).data : null;
  if (cert) after(() => sendPendingEmails(5));
  redirect(cert ? `/learn/${slug}/${lessonId}?done=1&cert=1` : UUID_RE.test(next) ? `/learn/${slug}/${next}` : `/learn/${slug}/${lessonId}?done=1`);
}
