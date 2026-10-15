import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function QuizCard({ lessonId, userId }: { lessonId: string; userId: string }) {
  const sb = await createClient();
  const { data: q } = await sb.from("quizzes").select("id, title, pass_score, max_attempts").eq("lesson_id", lessonId).maybeSingle();
  if (!q) return <p className="rounded-md bg-gold-300/20 p-3 text-sm">لم يُجهَّز هذا الاختبار بعد.</p>;
  const { data: at } = await sb.from("quiz_attempts").select("id, score_percent, passed, submitted_at").eq("quiz_id", q.id).eq("user_id", userId).order("started_at", { ascending: false });
  const done = (at ?? []).filter((a) => a.submitted_at); const best = done.reduce((m, a) => Math.max(m, a.score_percent ?? 0), 0);
  const passed = done.some((a) => a.passed);
  return (
    <div className="rounded-lg border border-gold-500/50 bg-ivory-50 p-5">
      <h2 className="text-xl font-bold text-navy-900">{q.title}</h2>
      <p className="mt-1 text-sm text-ink/70">درجة النجاح {q.pass_score}% · {q.max_attempts ? `المحاولات: ${done.length} من ${q.max_attempts}` : `المحاولات: ${done.length}`}{done.length > 0 && ` · أفضل نتيجة ${best}%`}</p>
      {passed && <p className="mt-2 font-semibold text-emerald-800">✔ نجحت في هذا الاختبار</p>}
      <Link href={`/quizzes/${q.id}`} className="btn btn-gold mt-4">{(at ?? []).some((a) => !a.submitted_at) ? "متابعة المحاولة" : done.length ? "محاولة جديدة" : "ابدأ الاختبار"}</Link>
    </div>
  );
}
