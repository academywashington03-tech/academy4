import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/course-validation";
import { Flash, fieldCls, cardCls } from "@/components/AdminUI";
import ResourceUploader from "@/components/ResourceUploader";
import QuizEditor from "@/components/QuizEditor";
import { updateLesson, deleteLesson, deleteResource } from "../../../../actions";

export default async function LessonEditor({ params, searchParams }: { params: Promise<{ id: string; lessonId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id, lessonId } = await params; const sp = await searchParams;
  await requirePath("/admin/courses");
  if (!UUID_RE.test(id) || !UUID_RE.test(lessonId)) notFound();
  const sb = await createClient();
  const { data: allowed } = await sb.rpc("manages_course", { cid: id });
  if (allowed !== true) notFound();
  const [{ data: l }, { data: files }] = await Promise.all([
    sb.from("lessons").select("*").eq("id", lessonId).eq("course_id", id).single(),
    sb.from("resources").select("id, title, size_bytes").eq("lesson_id", lessonId),
  ]);
  if (!l) notFound();
  const back = `/admin/courses/${id}/lessons/${lessonId}`;
  const hidden = <><input type="hidden" name="course_id" value={id} /><input type="hidden" name="lesson_id" value={lessonId} /></>;
  const showFiles = l.type === "pdf" || l.type === "resource" || l.type === "video" || l.type === "text";

  return (
    <div className="container-x max-w-3xl space-y-6 py-8">
      <Link href={`/admin/courses/${id}`} className="text-sm text-navy-700 underline">العودة إلى الدورة</Link>
      <h1 className="text-3xl font-bold text-navy-900">تعديل الدرس</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <form action={updateLesson} className={`${cardCls} space-y-4`}>
        {hidden}
        <label className="block text-sm font-medium">العنوان<input name="title" defaultValue={l.title} required className={fieldCls} /></label>
        <label className="block text-sm font-medium">وصف مختصر<textarea name="description" defaultValue={l.description ?? ""} rows={2} className={fieldCls} /></label>
        {l.type === "video" && (
          <div className="space-y-3 rounded-md border border-gold-500/50 p-4">
            <label className="block text-sm font-medium">مصدر الفيديو
              <select name="video_provider" defaultValue={l.video_provider ?? "cloudflare_stream"} className={fieldCls}>
                <option value="cloudflare_stream">Cloudflare Stream (موصى به للدورات المدفوعة)</option>
                <option value="youtube">YouTube (للمحتوى المجاني أو العام فقط)</option>
              </select></label>
            <label className="block text-sm font-medium">معرّف الفيديو أو رابطه<input name="video_ref" dir="ltr" defaultValue={l.video_ref ?? ""} className={fieldCls} /></label>
            <p className="text-xs text-ink/70">تنبيه: فيديو YouTube «غير المدرج» ليس حماية حقيقية؛ أي شخص لديه الرابط يستطيع مشاهدته. استخدم Cloudflare Stream للمحتوى المدفوع. ولا توجد طريقة تمنع تسجيل الشاشة بالكامل.</p>
          </div>
        )}
        {(l.type === "text" || l.type === "video") && (
          <label className="block text-sm font-medium">{l.type === "text" ? "نص الدرس" : "ملاحظات الدرس (اختياري)"}<textarea name="body" defaultValue={l.body ?? ""} rows={l.type === "text" ? 12 : 4} className={fieldCls} /></label>
        )}
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="is_free_preview" defaultChecked={l.is_free_preview} /> معاينة مجانية (يراه غير المشتركين)</label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="required_for_completion" defaultChecked={l.required_for_completion} /> مطلوب لإتمام الدورة</label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={l.published} /> منشور (ظاهر للطلاب المشتركين)</label>
        <button className="btn btn-gold w-full sm:w-auto">حفظ الدرس</button>
      </form>

      {l.type === "quiz" && <QuizEditor courseId={id} lessonId={lessonId} defaultTitle={l.title} defaultPass={70} />}

      {showFiles && (
        <section className={cardCls}>
          <h2 className="mb-3 text-xl font-bold text-navy-900">ملفات الدرس</h2>
          <ul className="mb-3 divide-y divide-navy-900/10 text-sm">
            {(files ?? []).map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                <span>{f.title} <span className="text-ink/50">({(f.size_bytes / 1048576).toFixed(1)} MB)</span></span>
                <form action={deleteResource}>
                  <input type="hidden" name="course_id" value={id} /><input type="hidden" name="resource_id" value={f.id} /><input type="hidden" name="back" value={back} />
                  <button className="btn border border-red-700/40 px-3 text-red-800">حذف</button>
                </form>
              </li>
            ))}
            {!files?.length && <li className="py-2 text-ink/60">لا توجد ملفات.</li>}
          </ul>
          <ResourceUploader kind="resource" courseId={id} lessonId={lessonId} label="رفع ملف PDF أو مادة مساندة" />
          <p className="mt-2 text-xs text-ink/60">الملفات خاصة: لا تُفتح إلا للمشتركين عبر روابط مؤقتة تُنشأ في الخادم.</p>
        </section>
      )}

      <form action={deleteLesson}>{hidden}<button className="btn border border-red-700/50 text-red-800">حذف الدرس</button></form>
    </div>
  );
}
