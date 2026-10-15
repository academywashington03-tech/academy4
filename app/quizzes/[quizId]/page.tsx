import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/course-validation";
import { startQuiz, submitQuiz } from "../actions";

export const metadata = { title: "اختبار | Quiz", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const ERR: Record<string, string> = { exhausted: "استنفدت عدد المحاولات المسموح.", unavailable: "هذا الاختبار غير متاح حالياً.", failed: "تعذّر تسليم الاختبار. حاول مرة أخرى." };

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function QuizPage({ params, searchParams }: { params: Promise<{ quizId: string }>; searchParams: Promise<{ a?: string; error?: string }> }) {
  const { quizId } = await params; const sp = await searchParams;
  if (!UUID_RE.test(quizId)) notFound();
  const s = await requirePath(`/quizzes/${quizId}`);
  const sb = await createClient();
  const { data: q } = await sb.from("quizzes").select("id, title, pass_score, max_attempts, lesson_id, course_id, courses(slug, title)").eq("id", quizId).maybeSingle();
  if (!q) notFound();
  const course = (q as any).courses as { slug: string; title: string };
  const { data: done } = await sb.from("quiz_attempts").select("id").eq("quiz_id", quizId).eq("user_id", s.id).not("submitted_at", "is", null);
  const backHref = q.lesson_id ? `/learn/${course.slug}/${q.lesson_id}` : `/learn/${course.slug}`;

  let questions: { question_id: string; kind: string; prompt: string; options: { id: string; label: string }[] }[] | null = null;
  if (sp.a && UUID_RE.test(sp.a)) {
    const r = await sb.rpc("quiz_attempt_questions", { p_attempt: sp.a });   // never contains is_correct
    questions = (r.data as any) ?? null;
  }

  return (
    <div className="container-x max-w-2xl py-8">
      <Link href={backHref} className="text-sm text-navy-700 underline">{course.title}</Link>
      <h1 className="mb-1 mt-2 text-3xl font-bold text-navy-900">{q.title}</h1>
      <p className="mb-5 text-sm text-ink/70">درجة النجاح {q.pass_score}% · {q.max_attempts ? `المحاولات المستخدمة ${done?.length ?? 0} من ${q.max_attempts}` : "عدد المحاولات غير محدود"}</p>
      {sp.error && <p role="alert" className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-900">{ERR[sp.error] ?? ERR.unavailable}</p>}

      {questions ? (
        <form action={submitQuiz} className="space-y-6">
          <input type="hidden" name="quiz_id" value={quizId} /><input type="hidden" name="attempt_id" value={sp.a} />
          {questions.map((qq, i) => (
            <fieldset key={qq.question_id} className="rounded-lg border border-navy-900/15 bg-ivory-50 p-4">
              <legend className="px-1 font-semibold text-navy-900">{i + 1}. {qq.prompt}</legend>
              <div className="mt-2 space-y-1">
                {qq.options.map((o, j) => (
                  <label key={o.id} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-gold-300/20">
                    <input type="radio" name={`q_${qq.question_id}`} value={o.id} required={j === 0} className="h-5 w-5" />{o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button className="btn btn-gold w-full">تسليم الاختبار</button>
          <p className="text-xs text-ink/60">يمكنك مغادرة الصفحة والعودة لمتابعة نفس المحاولة. بعد التسليم لا يمكن التعديل.</p>
        </form>
      ) : (
        <form action={startQuiz}><input type="hidden" name="quiz_id" value={quizId} /><button className="btn btn-gold">ابدأ / تابع الاختبار</button></form>
      )}
    </div>
  );
}
