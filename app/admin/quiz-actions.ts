"use server";
import { redirect } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE, toLatinDigits } from "@/lib/course-validation";
import { parseQuestionForm } from "@/lib/quiz";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
function need(f: FormData, k: string) { const v = str(f, k); if (!UUID_RE.test(v)) redirect("/admin?error=bad_request"); return v; }
const back = (c: string, l: string, key: "ok" | "error", code: string): never => redirect(`/admin/courses/${c}/lessons/${l}?${key}=${code}`);

async function guard(courseId: string) {
  await requirePath("/admin/courses");
  const sb = await createClient();
  const { data } = await sb.rpc("manages_course", { cid: courseId });
  if (data !== true) redirect("/forbidden");
  return sb;
}

export async function saveQuizSettings(form: FormData) {
  const courseId = need(form, "course_id"), lessonId = need(form, "lesson_id");
  const sb = await guard(courseId);
  const { data: lesson } = await sb.from("lessons").select("id, title, type").eq("id", lessonId).eq("course_id", courseId).maybeSingle();
  if (!lesson || lesson.type !== "quiz") redirect("/forbidden");
  const pass = Number(toLatinDigits(str(form, "pass_score").trim()));
  const maxRaw = str(form, "max_attempts").trim(); const max = maxRaw ? Number(toLatinDigits(maxRaw)) : null;
  if (!Number.isInteger(pass) || pass < 1 || pass > 100 || (max !== null && (!Number.isInteger(max) || max < 1 || max > 100))) back(courseId, lessonId, "error", "q_settings");
  const row = { title: (str(form, "title").trim() || lesson!.title).slice(0, 150), pass_score: pass, max_attempts: max,
    shuffle: form.get("shuffle") === "on", show_answers: form.get("show_answers") === "on", required: form.get("required") === "on" };
  const { data: ex } = await sb.from("quizzes").select("id").eq("lesson_id", lessonId).maybeSingle();
  const { error } = ex ? await sb.from("quizzes").update(row).eq("id", ex.id) : await sb.from("quizzes").insert({ ...row, course_id: courseId, lesson_id: lessonId });
  if (error) back(courseId, lessonId, "error", "failed");
  await sb.rpc("log_audit", { p_action: "quiz_saved", p_entity: "lesson", p_entity_id: lessonId, p_details: null });
  back(courseId, lessonId, "ok", "q_saved");
}

export async function addQuestion(form: FormData) {
  const courseId = need(form, "course_id"), lessonId = need(form, "lesson_id"), quizId = need(form, "quiz_id");
  const sb = await guard(courseId);
  const r = parseQuestionForm({ kind: str(form, "kind"), prompt: str(form, "prompt"), explanation: str(form, "explanation"), options: str(form, "options"), correct: str(form, "correct"), tf: str(form, "tf") });
  if (!r.ok) back(courseId, lessonId, "error", `q_${r.error}`);
  const d = (r as { draft: { kind: string; prompt: string; explanation: string; options: string[]; correct: number } }).draft;
  const { error } = await sb.rpc("save_question", { p_quiz: quizId, p_kind: d.kind, p_prompt: d.prompt, p_explanation: d.explanation, p_options: d.options, p_correct: d.correct });
  if (error) back(courseId, lessonId, "error", "failed");
  back(courseId, lessonId, "ok", "q_added");
}

export async function deleteQuestion(form: FormData) {
  const courseId = need(form, "course_id"), lessonId = need(form, "lesson_id"), qid = need(form, "question_id");
  const sb = await guard(courseId);
  const { data: q } = await sb.from("quiz_questions").select("quiz_id, quizzes(course_id)").eq("id", qid).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((q as any)?.quizzes?.course_id !== courseId) redirect("/forbidden");   // the question must belong to THIS course
  await sb.from("quiz_questions").delete().eq("id", qid);
  await sb.rpc("log_audit", { p_action: "question_deleted", p_entity: "quiz", p_entity_id: String(q!.quiz_id), p_details: { question: qid } });
  back(courseId, lessonId, "ok", "deleted");
}
