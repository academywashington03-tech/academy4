import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/course-validation";

export const metadata = { title: "نتيجة الاختبار | Quiz result", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function QuizResult({ params }: { params: Promise<{ quizId: string; attemptId: string }> }) {
  const { quizId, attemptId } = await params;
  if (!UUID_RE.test(quizId) || !UUID_RE.test(attemptId)) notFound();
  const s = await requirePath(`/quizzes/${quizId}`);
  const sb = await createClient();
  const { data: a } = await sb.from("quiz_attempts").select("score_percent, passed, correct_count, total_count, submitted_at, quizzes(title, pass_score, max_attempts, lesson_id, course_id, courses(slug, title))").eq("id", attemptId).eq("user_id", s.id).eq("quiz_id", quizId).not("submitted_at", "is", null).maybeSingle();
  if (!a) notFound();
  const quiz = (a as any).quizzes; const course = quiz.courses as { slug: string; title: string };
  const { data: review } = await sb.rpc("quiz_review", { p_attempt: attemptId });
  const { data: cert } = await sb.from("certificates").select("certificate_no").eq("course_id", quiz.course_id).eq("user_id", s.id).is("revoked_at", null).maybeSingle();
  const { count } = await sb.from("quiz_attempts").select("id", { count: "exact", head: true }).eq("quiz_id", quizId).eq("user_id", s.id).not("submitted_at", "is", null);
  const canRetry = !quiz.max_attempts || (count ?? 0) < quiz.max_attempts;
  const back = quiz.lesson_id ? `/learn/${course.slug}/${quiz.lesson_id}` : `/learn/${course.slug}`;

  return (
    <div className="container-x max-w-2xl py-10">
      <h1 className="text-3xl font-bold text-navy-900">{quiz.title}</h1>
      <div className={`mt-5 rounded-lg p-6 text-center ${a.passed ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`} role="status">
        <p className="text-5xl font-bold">{a.score_percent}%</p>
        <p className="mt-2 text-lg font-semibold">{a.passed ? "نجحت ✔" : `لم تبلغ درجة النجاح (${quiz.pass_score}%)`}</p>
        <p className="mt-1 text-sm">{a.correct_count} إجابة صحيحة من {a.total_count}</p>
      </div>
      {cert && <p className="mt-4 rounded-md bg-gold-300/40 p-3 text-sm font-semibold">🎓 شهادتك جاهزة: <Link href="/certificates" className="underline">شهاداتي</Link></p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={back} className="btn btn-navy">العودة إلى الدورة</Link>
        {!a.passed && canRetry && <Link href={`/quizzes/${quizId}`} className="btn border border-navy-900/30">محاولة جديدة</Link>}
      </div>
      {(review?.length ?? 0) > 0 && (
        <section className="mt-8"><h2 className="mb-3 text-xl font-bold text-navy-900">مراجعة الإجابات</h2>
          <ol className="space-y-3">
            {(review as any[]).map((r, i) => (
              <li key={i} className="rounded-lg border border-navy-900/15 bg-ivory-50 p-4 text-sm">
                <p className="font-semibold">{i + 1}. {r.prompt}</p>
                <p className={r.is_correct ? "text-emerald-800" : "text-red-800"}>إجابتك: {r.chosen ?? "لم تُجب"} {r.is_correct ? "✔" : "✘"}</p>
                {!r.is_correct && <p className="text-emerald-800">الصحيحة: {r.correct_label}</p>}
                {r.explanation && <p className="mt-1 text-ink/70">{r.explanation}</p>}
              </li>
            ))}
          </ol></section>
      )}
    </div>
  );
}
