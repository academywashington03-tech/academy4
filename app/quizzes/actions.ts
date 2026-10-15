"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sendPendingEmails } from "@/lib/outbox";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/course-validation";
import { collectAnswers } from "@/lib/quiz";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function startQuiz(form: FormData) {
  const quizId = str(form, "quiz_id");
  if (!UUID_RE.test(quizId)) redirect("/dashboard");
  if (!(await getSessionProfile())) redirect(`/login?next=${encodeURIComponent(`/quizzes/${quizId}`)}`);
  const { data, error } = await (await createClient()).rpc("start_quiz", { p_quiz: quizId });
  if (error || !data) redirect(`/quizzes/${quizId}?error=${error?.message.includes("exhausted") ? "exhausted" : "unavailable"}`);
  redirect(`/quizzes/${quizId}?a=${data}`);
}

export async function submitQuiz(form: FormData) {
  const quizId = str(form, "quiz_id"), attempt = str(form, "attempt_id");
  if (!UUID_RE.test(quizId) || !UUID_RE.test(attempt)) redirect("/dashboard");
  const s = await getSessionProfile();
  if (!s || s.suspended) redirect(`/login?next=${encodeURIComponent(`/quizzes/${quizId}`)}`);
  const sb = await createClient();
  // Only {questionId: optionId} pairs are sent. Grading and the pass/fail decision happen in the database.
  const { error } = await sb.rpc("submit_quiz", { p_attempt: attempt, p_answers: collectAnswers(form.entries()) });
  if (error) redirect(`/quizzes/${quizId}?error=failed`);
  const { data: q } = await sb.from("quizzes").select("course_id").eq("id", quizId).maybeSingle();
  if (q) await sb.rpc("try_issue_certificate", { p_course: q.course_id });   // no-op unless the completion rules are now met
  revalidatePath("/dashboard");
  after(() => sendPendingEmails(5));
  redirect(`/quizzes/${quizId}/result/${attempt}`);
}
