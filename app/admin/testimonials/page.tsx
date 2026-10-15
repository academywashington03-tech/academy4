import { adminCtx } from "@/lib/admin-helpers";
import { Flash, fieldCls, cardCls } from "@/components/AdminUI";
import { saveTestimonial, toggleTestimonial, deleteTestimonial } from "../ops-actions";

export default async function Testimonials({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { sb } = await adminCtx("/admin/testimonials"); const sp = await searchParams;
  const { data } = await sb.from("testimonials").select("id, author_name, body, course_title, published").order("created_at", { ascending: false }).limit(100);
  return (
    <div className="container-x max-w-3xl space-y-6 py-8">
      <h1 className="text-3xl font-bold text-navy-900">آراء الطلاب</h1>
      <p className="text-sm text-ink/70">أضف فقط آراء حقيقية صدرت فعلاً من طلابك وبموافقتهم على نشرها. تظهر في الصفحة الرئيسية عند تفعيل «منشور». لا يضيف النظام أي رأي من تلقاء نفسه.</p>
      <Flash ok={sp.ok} error={sp.error} />
      <form action={saveTestimonial} className={`${cardCls} space-y-3`}>
        <label className="block text-sm font-medium">اسم صاحب الرأي<input name="author_name" required className={fieldCls} /></label>
        <label className="block text-sm font-medium">نص الرأي<textarea name="body" required rows={3} maxLength={600} className={fieldCls} /></label>
        <label className="block text-sm font-medium">الدورة (اختياري)<input name="course_title" className={fieldCls} /></label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="published" /> نشر في الصفحة الرئيسية الآن</label>
        <button className="btn btn-gold">إضافة</button>
      </form>
      <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50 text-sm">
        {(data ?? []).map((t) => (
          <li key={t.id} className="space-y-2 p-3">
            <p className="whitespace-pre-line">{t.body}</p>
            <p className="font-semibold">{t.author_name}{t.course_title && <span className="font-normal text-ink/60"> — {t.course_title}</span>} <span className={t.published ? "text-emerald-800" : "text-ink/50"}>· {t.published ? "منشور" : "مسودة"}</span></p>
            <div className="flex gap-2">
              <form action={toggleTestimonial}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="published" value={t.published ? "0" : "1"} /><button className="btn border border-navy-900/30 px-3">{t.published ? "إلغاء النشر" : "نشر"}</button></form>
              <form action={deleteTestimonial}><input type="hidden" name="id" value={t.id} /><button className="btn border border-red-700/40 px-3 text-red-800">حذف</button></form>
            </div>
          </li>
        ))}
        {!data?.length && <li className="p-4 text-ink/60">لا توجد آراء بعد.</li>}
      </ul>
    </div>
  );
}
