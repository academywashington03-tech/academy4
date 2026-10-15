import { createClient } from "@/lib/supabase/server";
import { fieldCls, cardCls } from "@/components/AdminUI";
import { saveQuizSettings, addQuestion, deleteQuestion } from "@/app/admin/quiz-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function QuizEditor({ courseId, lessonId, defaultTitle, defaultPass }: { courseId: string; lessonId: string; defaultTitle: string; defaultPass: number }) {
  const sb = await createClient();
  const { data: quiz } = await sb.from("quizzes").select("*").eq("lesson_id", lessonId).maybeSingle();
  const { data: qs } = quiz ? await sb.from("quiz_questions").select("id, kind, prompt, explanation, quiz_options(label, is_correct, sort_order)").eq("quiz_id", quiz.id).order("sort_order") : { data: [] };
  const hid = <><input type="hidden" name="course_id" value={courseId} /><input type="hidden" name="lesson_id" value={lessonId} /></>;
  return (
    <section className={`${cardCls} space-y-5`}>
      <h2 className="text-xl font-bold text-navy-900">إعدادات الاختبار</h2>
      <form action={saveQuizSettings} className="grid gap-3 sm:grid-cols-2">
        {hid}
        <label className="text-sm font-medium sm:col-span-2">عنوان الاختبار<input name="title" defaultValue={quiz?.title ?? defaultTitle} className={fieldCls} /></label>
        <label className="text-sm font-medium">درجة النجاح %<input name="pass_score" inputMode="numeric" defaultValue={quiz?.pass_score ?? defaultPass} className={fieldCls} /></label>
        <label className="text-sm font-medium">أقصى عدد محاولات (فارغ = بلا حد)<input name="max_attempts" inputMode="numeric" defaultValue={quiz?.max_attempts ?? ""} className={fieldCls} /></label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="shuffle" defaultChecked={quiz?.shuffle ?? true} /> ترتيب عشوائي للأسئلة والخيارات</label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="show_answers" defaultChecked={quiz?.show_answers ?? true} /> إظهار الإجابات الصحيحة بعد التسليم</label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="required" defaultChecked={quiz?.required ?? true} /> النجاح فيه شرط للحصول على الشهادة</label>
        <button className="btn btn-gold sm:col-span-2">{quiz ? "حفظ الإعدادات" : "إنشاء الاختبار"}</button>
      </form>

      {quiz && (<>
        <h3 className="text-lg font-bold text-navy-900">الأسئلة ({qs?.length ?? 0})</h3>
        <p className="text-xs text-ink/60">الإجابات الصحيحة لا تصل لمتصفح الطالب قبل التسليم، ويجري التصحيح في الخادم. حذف سؤال يحذف إجابات الطلاب السابقة عليه.</p>
        <ol className="space-y-3">
          {((qs ?? []) as any[]).map((q) => (
            <li key={q.id} className="rounded-md border border-navy-900/15 bg-white p-3 text-sm">
              <p className="font-semibold">{q.prompt}</p>
              <ul className="mt-1 space-y-0.5">{[...q.quiz_options].sort((a: any, b: any) => a.sort_order - b.sort_order).map((o: any) => <li key={o.label} className={o.is_correct ? "font-semibold text-emerald-800" : "text-ink/70"}>{o.is_correct ? "✔ " : "○ "}{o.label}</li>)}</ul>
              {q.explanation && <p className="mt-1 text-xs text-ink/60">الشرح: {q.explanation}</p>}
              <form action={deleteQuestion} className="mt-2">{hid}<input type="hidden" name="question_id" value={q.id} /><button className="btn border border-red-700/40 px-3 text-red-800">حذف السؤال</button></form>
            </li>
          ))}
          {!qs?.length && <li className="text-sm text-ink/60">لا توجد أسئلة بعد.</li>}
        </ol>
        <form action={addQuestion} className="space-y-3 rounded-md border border-gold-500/50 p-4">
          {hid}<input type="hidden" name="quiz_id" value={quiz.id} />
          <h4 className="font-semibold">إضافة سؤال</h4>
          <label className="block text-sm font-medium">النوع<select name="kind" className={fieldCls}><option value="mcq">اختيار من متعدد</option><option value="true_false">صح / خطأ</option></select></label>
          <label className="block text-sm font-medium">نص السؤال<textarea name="prompt" required rows={2} className={fieldCls} /></label>
          <label className="block text-sm font-medium">الخيارات (لسؤال الاختيار من متعدد: خيار في كل سطر)<textarea name="options" rows={4} className={fieldCls} /></label>
          <label className="block text-sm font-medium">رقم الإجابة الصحيحة (1 = أول خيار)<input name="correct" inputMode="numeric" dir="ltr" className={fieldCls} /></label>
          <fieldset className="text-sm"><legend className="font-medium">لسؤال صح/خطأ: الإجابة الصحيحة</legend>
            <label className="me-6 inline-flex min-h-[44px] items-center gap-2"><input type="radio" name="tf" value="true" /> صح</label>
            <label className="inline-flex min-h-[44px] items-center gap-2"><input type="radio" name="tf" value="false" /> خطأ</label></fieldset>
          <label className="block text-sm font-medium">شرح الإجابة (اختياري)<textarea name="explanation" rows={2} className={fieldCls} /></label>
          <button className="btn btn-navy">إضافة السؤال</button>
        </form>
      </>)}
    </section>
  );
}
