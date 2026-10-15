import { adminCtx } from "@/lib/admin-helpers";
import { Flash, fieldCls, cardCls } from "@/components/AdminUI";
import { saveBundle, deleteBundle } from "../commerce-actions";

type Bundle = { id: string; slug: string; title: string; description: string | null; price_minor: number; period_days: number | null; status: string; bundle_courses: { course_id: string }[] };

function BundleForm({ b, courses }: { b?: Bundle; courses: { id: string; title: string }[] }) {
  const chosen = new Set((b?.bundle_courses ?? []).map((x) => x.course_id));
  return (
    <form action={saveBundle} className="grid gap-3 sm:grid-cols-2">
      {b && <input type="hidden" name="id" value={b.id} />}
      <label className="text-sm font-medium">العنوان<input name="title" defaultValue={b?.title} required className={fieldCls} /></label>
      <label className="text-sm font-medium">الرابط (إنجليزي)<input name="slug" dir="ltr" defaultValue={b?.slug} required className={fieldCls} /></label>
      <label className="text-sm font-medium">السعر (ج.م)<input name="price" dir="ltr" inputMode="decimal" defaultValue={b ? (b.price_minor / 100).toString() : ""} required className={fieldCls} /></label>
      <label className="text-sm font-medium">مدة الاشتراك بالأيام (فارغ = شراء عادي مدى الحياة)<input name="period_days" dir="ltr" inputMode="numeric" defaultValue={b?.period_days ?? ""} className={fieldCls} /></label>
      <label className="text-sm font-medium sm:col-span-2">الوصف<textarea name="description" defaultValue={b?.description ?? ""} rows={2} className={fieldCls} /></label>
      <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">الدورات</legend>
        <div className="mt-1 grid gap-1 sm:grid-cols-2">{courses.map((c) => <label key={c.id} className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="course_ids" value={c.id} defaultChecked={chosen.has(c.id)} />{c.title}</label>)}</div></fieldset>
      <label className="text-sm font-medium">الحالة<select name="status" defaultValue={b?.status ?? "draft"} className={fieldCls}><option value="draft">مسودة</option><option value="published">منشورة</option><option value="archived">مؤرشفة</option></select></label>
      <button className="btn btn-gold self-end">{b ? "حفظ" : "إنشاء حزمة"}</button>
    </form>
  );
}

export default async function Bundles({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { sb } = await adminCtx("/admin/bundles"); const sp = await searchParams;
  const [{ data: list }, { data: courses }] = await Promise.all([
    sb.from("bundles").select("id, slug, title, description, price_minor, period_days, status, bundle_courses(course_id)").order("title"),
    sb.from("courses").select("id, title").neq("status", "archived").order("title"),
  ]);
  return (
    <div className="container-x max-w-3xl space-y-6 py-8">
      <h1 className="text-3xl font-bold text-navy-900">الحزم والاشتراكات</h1>
      <p className="text-sm text-ink/70">الحزمة تجمع عدة دورات بسعر واحد. إن حدّدت «مدة الاشتراك» تصبح فترة مدفوعة مسبقاً: ينتهي الوصول تلقائياً بانتهائها، والتجديد يتم بشراء الحزمة مرة أخرى. لا يوجد خصم تلقائي متكرر.</p>
      <Flash ok={sp.ok} error={sp.error} />
      <div className={cardCls}><h2 className="mb-3 text-xl font-bold text-navy-900">حزمة جديدة</h2><BundleForm courses={courses ?? []} /></div>
      {((list ?? []) as unknown as Bundle[]).map((b) => (
        <details key={b.id} className={cardCls}>
          <summary className="min-h-[44px] cursor-pointer font-semibold text-navy-900">{b.title} · {(b.price_minor / 100).toLocaleString("ar-EG")} ج.م · {b.status === "published" ? "منشورة" : b.status === "draft" ? "مسودة" : "مؤرشفة"}{b.period_days ? ` · اشتراك ${b.period_days} يوماً` : ""}</summary>
          <div className="mt-3"><BundleForm b={b} courses={courses ?? []} />
            <form action={deleteBundle} className="mt-3"><input type="hidden" name="id" value={b.id} /><button className="btn border border-red-700/40 text-red-800">حذف الحزمة</button></form></div>
        </details>
      ))}
    </div>
  );
}
