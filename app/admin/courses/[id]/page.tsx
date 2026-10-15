import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/course-validation";
import { Flash, fieldCls, cardCls } from "@/components/AdminUI";
import ResourceUploader from "@/components/ResourceUploader";
import {
  updateCourse, setCourseStatus, duplicateCourse, deleteCourse, addSection, renameSection, moveSection, deleteSection,
  addLesson, moveLesson, deleteResource,
} from "../../actions";

const TYPES: Record<string, string> = { video: "فيديو", pdf: "ملف PDF", text: "درس نصي", quiz: "اختبار", resource: "ملفات للتحميل" };
const STATUS: Record<string, string> = { draft: "مسودة", published: "منشورة", archived: "مؤرشفة" };
const sizeMb = (b: number) => (b / 1048576).toFixed(1);

export default async function CourseEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  const s = await requirePath("/admin/courses");
  if (!UUID_RE.test(id)) notFound();
  const sb = await createClient();
  const { data: allowed } = await sb.rpc("manages_course", { cid: id });
  if (allowed !== true) notFound(); // also hides other instructors' courses
  const admin = s.role === "super_admin";

  const [{ data: c }, { data: sections }, { data: lessons }, { data: resources }, { data: cats }, { data: instrs }] = await Promise.all([
    sb.from("courses").select("*").eq("id", id).single(),
    sb.from("sections").select("id, title, sort_order").eq("course_id", id).order("sort_order"),
    sb.from("lessons").select("id, section_id, title, type, published, is_free_preview, sort_order").eq("course_id", id).order("sort_order"),
    sb.from("resources").select("id, title, lesson_id, size_bytes").eq("course_id", id).is("lesson_id", null),
    sb.from("categories").select("id, name_ar").order("sort_order"),
    admin ? sb.from("profiles").select("id, full_name, email").eq("role", "instructor") : Promise.resolve({ data: [] as { id: string; full_name: string; email: string }[] }),
  ]);
  if (!c) notFound();
  const hid = <input type="hidden" name="course_id" value={id} />;

  return (
    <div className="container-x space-y-8 py-8">
      <div>
        <Link href="/admin/courses" className="text-sm text-navy-700 underline">كل الدورات</Link>
        <h1 className="mt-2 text-3xl font-bold text-navy-900">{c.title}</h1>
        <p className="mt-1 text-sm text-ink/60"><Link className="underline" href={`/admin/courses/${id}/students`}>عرض طلاب الدورة وتقدمهم</Link> · الحالة: {STATUS[c.status]}{c.status === "published" && <> · <Link className="underline" href={`/courses/${c.slug}`}>عرض الصفحة العامة</Link></>}</p>
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      {admin && (
        <div className="flex flex-wrap gap-2">
          {c.status !== "published" && <form action={setCourseStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="published" /><button className="btn btn-gold">نشر</button></form>}
          {c.status === "published" && <form action={setCourseStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="draft" /><button className="btn btn-navy">إلغاء النشر</button></form>}
          {c.status !== "archived" && <form action={setCourseStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="archived" /><button className="btn border border-navy-900/30">أرشفة</button></form>}
          <form action={duplicateCourse}><input type="hidden" name="id" value={id} /><button className="btn border border-navy-900/30">نسخ الدورة</button></form>
          <form action={deleteCourse}><input type="hidden" name="id" value={id} /><button className="btn border border-red-700/50 text-red-800">حذف</button></form>
        </div>
      )}

      {/* Course details */}
      <form action={updateCourse} className={`${cardCls} space-y-4`}>
        <input type="hidden" name="id" value={id} />
        <h2 className="text-xl font-bold text-navy-900">بيانات الدورة</h2>
        <label className="block text-sm font-medium">العنوان<input name="title" defaultValue={c.title} required className={fieldCls} /></label>
        <label className="block text-sm font-medium">وصف مختصر<textarea name="short_description" defaultValue={c.short_description ?? ""} rows={2} maxLength={300} className={fieldCls} /></label>
        <label className="block text-sm font-medium">الوصف الكامل<textarea name="description" defaultValue={c.description ?? ""} rows={6} className={fieldCls} /></label>
        <label className="block text-sm font-medium">ماذا سيتعلم الطالب (سطر لكل هدف)<textarea name="objectives" defaultValue={(c.objectives ?? []).join("\n")} rows={4} className={fieldCls} /></label>
        <label className="block text-sm font-medium">المتطلبات<textarea name="prerequisites" defaultValue={c.prerequisites ?? ""} rows={2} className={fieldCls} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">المستوى
            <select name="level" defaultValue={c.level ?? "beginner"} className={fieldCls}><option value="beginner">مبتدئ</option><option value="intermediate">متوسط</option><option value="advanced">متقدم</option></select></label>
          <label className="block text-sm font-medium">لغة الدورة
            <select name="language" defaultValue={c.language} className={fieldCls}><option value="ar">العربية</option><option value="en">English</option></select></label>
          <label className="block text-sm font-medium">المدة التقديرية (بالدقائق)<input name="duration_minutes" inputMode="numeric" defaultValue={c.duration_minutes ?? ""} className={fieldCls} /></label>
          <label className="block text-sm font-medium">مدة الوصول بالأيام (فارغ = مدى الحياة)<input name="access_days" inputMode="numeric" defaultValue={c.access_days ?? ""} className={fieldCls} /></label>
          <label className="block text-sm font-medium">درجة النجاح %<input name="pass_score" inputMode="numeric" defaultValue={c.pass_score} className={fieldCls} /></label>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="certificate_enabled" defaultChecked={c.certificate_enabled} /> تُمنح شهادة إتمام</label>

        {admin ? (
          <fieldset className="space-y-4 rounded-md border border-gold-500/50 p-4">
            <legend className="px-2 text-sm font-semibold">إعدادات الإدارة</legend>
            <label className="block text-sm font-medium">الرابط (إنجليزي صغير وشرطات)<input name="slug" dir="ltr" defaultValue={c.slug} className={fieldCls} /></label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-medium">التسعير
                <select name="pricing" defaultValue={c.is_free ? "free" : "paid"} className={fieldCls}><option value="paid">مدفوعة</option><option value="free">مجانية</option></select></label>
              <label className="block text-sm font-medium">السعر (ج.م)<input name="price" dir="ltr" inputMode="decimal" defaultValue={c.is_free ? "" : (c.price_minor / 100).toString()} className={fieldCls} /></label>
              <label className="block text-sm font-medium">سعر العرض (اختياري)<input name="promo_price" dir="ltr" inputMode="decimal" defaultValue={c.promo_price_minor ? (c.promo_price_minor / 100).toString() : ""} className={fieldCls} /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">التصنيف
                <select name="category_id" defaultValue={c.category_id ?? ""} className={fieldCls}><option value="">—</option>{(cats ?? []).map((k) => <option key={k.id} value={k.id}>{k.name_ar}</option>)}</select></label>
              <label className="block text-sm font-medium">المدرّس
                <select name="instructor_id" defaultValue={c.instructor_id ?? ""} className={fieldCls}><option value="">—</option>{(instrs ?? []).map((k) => <option key={k.id} value={k.id}>{k.full_name || k.email}</option>)}</select></label>
            </div>
            <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="enrollment_open" defaultChecked={c.enrollment_open} /> التسجيل مفتوح</label>
          </fieldset>
        ) : <p className="text-sm text-ink/60">السعر والحالة والتعيين يديرها المدير فقط.</p>}
        <button className="btn btn-gold w-full sm:w-auto">حفظ</button>
      </form>

      {/* Cover */}
      <section className={cardCls}>
        <h2 className="mb-3 text-xl font-bold text-navy-900">صورة الغلاف</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.cover_url && <img src={c.cover_url} alt="" className="mb-3 aspect-video w-full max-w-sm rounded-md object-cover" />}
        <ResourceUploader kind="cover" courseId={id} label="رفع صورة (JPG / PNG / WebP، حتى 5 ميغابايت)" />
      </section>

      {/* Curriculum */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-navy-900">المحتوى</h2>
        {(sections ?? []).map((sec) => {
          const ls = (lessons ?? []).filter((l) => l.section_id === sec.id);
          return (
            <div key={sec.id} className={cardCls}>
              <form action={renameSection} className="flex gap-2">
                {hid}<input type="hidden" name="section_id" value={sec.id} />
                <input name="title" defaultValue={sec.title} aria-label="اسم القسم" className={`${fieldCls} mt-0 font-semibold`} />
                <button className="btn border border-navy-900/30">حفظ</button>
              </form>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                {(["up", "down"] as const).map((d) => <form key={d} action={moveSection}>{hid}<input type="hidden" name="section_id" value={sec.id} /><input type="hidden" name="dir" value={d} /><button className="btn border border-navy-900/20 px-3">{d === "up" ? "▲ أعلى" : "▼ أسفل"}</button></form>)}
                <form action={deleteSection}>{hid}<input type="hidden" name="section_id" value={sec.id} /><button className="btn border border-red-700/40 px-3 text-red-800">حذف القسم</button></form>
              </div>
              <ul className="mt-3 divide-y divide-navy-900/10">
                {ls.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/admin/courses/${id}/lessons/${l.id}`} className="min-h-[44px] flex-1 py-2 text-navy-900 underline-offset-4 hover:underline">
                      {l.title} <span className="text-xs text-ink/60">({TYPES[l.type]}{l.is_free_preview ? " · معاينة مجانية" : ""} · {l.published ? "منشور" : "مسودة"})</span>
                    </Link>
                    <span className="flex gap-1">
                      {(["up", "down"] as const).map((d) => <form key={d} action={moveLesson}>{hid}<input type="hidden" name="section_id" value={sec.id} /><input type="hidden" name="lesson_id" value={l.id} /><input type="hidden" name="dir" value={d} /><button className="btn border border-navy-900/20 px-3" aria-label={d === "up" ? "أعلى" : "أسفل"}>{d === "up" ? "▲" : "▼"}</button></form>)}
                    </span>
                  </li>
                ))}
                {!ls.length && <li className="py-3 text-sm text-ink/60">لا توجد دروس في هذا القسم.</li>}
              </ul>
              <form action={addLesson} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                {hid}<input type="hidden" name="section_id" value={sec.id} />
                <input name="title" required placeholder="عنوان درس جديد" aria-label="عنوان الدرس" className={`${fieldCls} mt-0`} />
                <select name="type" aria-label="نوع الدرس" className={`${fieldCls} mt-0`}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <button className="btn btn-navy">إضافة درس</button>
              </form>
            </div>
          );
        })}
        <form action={addSection} className="flex gap-2">
          {hid}<input name="title" required placeholder="اسم قسم جديد" aria-label="اسم القسم الجديد" className={`${fieldCls} mt-0`} /><button className="btn btn-gold">إضافة قسم</button>
        </form>
      </section>

      {/* Course-level downloads */}
      <section className={cardCls}>
        <h2 className="mb-3 text-xl font-bold text-navy-900">ملفات عامة للدورة</h2>
        <ul className="mb-3 divide-y divide-navy-900/10 text-sm">
          {(resources ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <span>{r.title} <span className="text-ink/50">({sizeMb(r.size_bytes)} MB)</span></span>
              <form action={deleteResource}>{hid}<input type="hidden" name="resource_id" value={r.id} /><button className="btn border border-red-700/40 px-3 text-red-800">حذف</button></form>
            </li>
          ))}
          {!resources?.length && <li className="py-2 text-ink/60">لا توجد ملفات.</li>}
        </ul>
        <ResourceUploader kind="resource" courseId={id} label="رفع ملف (PDF وغيره، حتى 50 ميغابايت)" />
      </section>
    </div>
  );
}
