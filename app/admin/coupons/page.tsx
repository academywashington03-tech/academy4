import { adminCtx } from "@/lib/admin-helpers";
import { Flash, fieldCls, cardCls } from "@/components/AdminUI";
import { saveCoupon, toggleCoupon, deleteCoupon } from "../commerce-actions";

export default async function Coupons({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { sb } = await adminCtx("/admin/coupons"); const sp = await searchParams;
  const [{ data: list }, { data: courses }, { data: bundles }] = await Promise.all([
    sb.from("coupons").select("id, code, percent_off, amount_off_minor, expires_at, max_redemptions, active, course_id, bundle_id").order("code"),
    sb.from("courses").select("id, title").eq("status", "published").eq("is_free", false),
    sb.from("bundles").select("id, title").eq("status", "published"),
  ]);
  return (
    <div className="container-x max-w-3xl space-y-6 py-8">
      <h1 className="text-3xl font-bold text-navy-900">كوبونات الخصم</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <form action={saveCoupon} className={`${cardCls} grid gap-3 sm:grid-cols-2`}>
        <label className="text-sm font-medium">الرمز<input name="code" dir="ltr" required className={fieldCls} placeholder="EID25" /></label>
        <label className="text-sm font-medium">النوع
          <select name="kind" className={fieldCls}><option value="percent">نسبة مئوية %</option><option value="fixed">مبلغ ثابت (ج.م)</option></select></label>
        <label className="text-sm font-medium">القيمة<input name="value" dir="ltr" inputMode="decimal" required className={fieldCls} /></label>
        <label className="text-sm font-medium">ينتهي في (اختياري)<input name="expires" type="date" dir="ltr" className={fieldCls} /></label>
        <label className="text-sm font-medium">أقصى عدد استخدامات (اختياري)<input name="max" inputMode="numeric" dir="ltr" className={fieldCls} /></label>
        <label className="text-sm font-medium">ينطبق على
          <select name="scope" className={fieldCls}><option value="all">كل الدورات والحزم</option>
            {(courses ?? []).map((c) => <option key={c.id} value={`course:${c.id}`}>دورة: {c.title}</option>)}
            {(bundles ?? []).map((b) => <option key={b.id} value={`bundle:${b.id}`}>حزمة: {b.title}</option>)}</select></label>
        <button className="btn btn-gold sm:col-span-2">إنشاء كوبون</button>
        <p className="text-xs text-ink/60 sm:col-span-2">يُحسب الخصم في الخادم. كل طالب يستخدم الكوبون مرة واحدة. لا يُسمح بخصم يجعل الإجمالي صفراً (استخدم «منح وصول» للمنح المجانية).</p>
      </form>
      <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50">
        {(list ?? []).map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span><span dir="ltr" className="font-mono font-semibold">{c.code}</span> · {c.percent_off ? `${c.percent_off}%` : `${(c.amount_off_minor! / 100).toLocaleString("ar-EG")} ج.م`}
              {c.expires_at && <> · حتى {new Date(c.expires_at).toLocaleDateString("ar-EG")}</>}{c.max_redemptions && <> · حد {c.max_redemptions}</>}
              {c.course_id || c.bundle_id ? " · محدد" : ""}{!c.active && <span className="text-red-800"> · معطّل</span>}</span>
            <span className="flex gap-2">
              <form action={toggleCoupon}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={c.active ? "0" : "1"} /><button className="btn border border-navy-900/30 px-3">{c.active ? "تعطيل" : "تفعيل"}</button></form>
              <form action={deleteCoupon}><input type="hidden" name="id" value={c.id} /><button className="btn border border-red-700/40 px-3 text-red-800">حذف</button></form>
            </span>
          </li>
        ))}
        {!list?.length && <li className="p-4 text-sm text-ink/60">لا توجد كوبونات.</li>}
      </ul>
    </div>
  );
}
