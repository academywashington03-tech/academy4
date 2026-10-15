import Link from "next/link";
import { adminCtx } from "@/lib/admin-helpers";
import { cardCls } from "@/components/AdminUI";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ISSUE: Record<string, string> = {
  paid_online_without_verified_transaction: "مدفوع إلكترونياً بلا عملية مؤكدة", amount_mismatch: "عدم تطابق المبلغ", paid_but_not_fulfilled: "مدفوع ولم يُفعَّل",
  manual_paid_without_reviewer: "اعتماد يدوي بلا مراجع", stale_pending_online: "معلّق أكثر من 24 ساعة", purchase_enrollment_without_paid_order: "اشتراك بلا طلب مدفوع",
};
const egp = (m: number | bigint) => (Number(m) / 100).toLocaleString("ar-EG");

export default async function Reports() {
  const { sb } = await adminCtx("/admin/reports");
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [perf, rec, paid, paid30, refunds] = await Promise.all([
    sb.rpc("admin_course_performance"), sb.rpc("admin_reconciliation"),
    sb.from("orders").select("total_minor").eq("status", "paid"), sb.from("orders").select("total_minor").eq("status", "paid").gte("created_at", since),
    sb.from("orders").select("total_minor").eq("status", "refunded"),
  ]);
  const sum = (r: any) => (r.data ?? []).reduce((a: number, o: any) => a + o.total_minor, 0);
  const exports = [["students", "الطلاب"], ["enrollments", "التسجيلات"], ["orders", "المبيعات المؤكدة"], ["refunds", "المستردات"], ["courses", "أداء الدورات"], ["reconciliation", "مطابقة المدفوعات"]];
  return (
    <div className="container-x space-y-8 py-8">
      <h1 className="text-3xl font-bold text-navy-900">التقارير</h1>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["المبيعات المؤكدة (الكل)", `${egp(sum(paid))} ج.م`], ["آخر 30 يوماً", `${egp(sum(paid30))} ج.م`], ["المستردات", `${egp(sum(refunds))} ج.م`], ["بنود تحتاج مراجعة", String(rec.data?.length ?? 0)]].map(([k, v]) =>
          <li key={k} className={cardCls}><p className="text-sm text-ink/60">{k}</p><p className="mt-1 text-2xl font-bold text-navy-900">{v}</p></li>)}
      </ul>

      <section><h2 className="mb-3 text-xl font-bold text-navy-900">تصدير CSV</h2>
        <div className="flex flex-wrap gap-2">{exports.map(([k, l]) => <a key={k} href={`/api/admin/export/${k}`} className="btn border border-navy-900/30">{l}</a>)}</div>
        <p className="mt-2 text-xs text-ink/60">الملفات تحتوي بيانات شخصية: احفظها في مكان آمن. كل تصدير يُسجَّل في سجل التدقيق.</p></section>

      <section><h2 className="mb-3 text-xl font-bold text-navy-900">مطابقة المدفوعات</h2>
        {rec.data?.length ? (
          <ul className="divide-y divide-navy-900/10 rounded-lg border border-red-700/30 bg-red-50 text-sm">
            {(rec.data as any[]).map((r, i) => <li key={i} className="flex flex-wrap justify-between gap-2 p-3"><span className="font-semibold">{ISSUE[r.issue] ?? r.issue}</span><span className="text-ink/70">{r.detail}</span><span dir="ltr" className="font-mono text-xs">{String(r.order_id).slice(0, 8)}</span></li>)}
          </ul>
        ) : <p className="rounded-lg border border-emerald-700/30 bg-emerald-50 p-4 text-sm text-emerald-900">✔ لا توجد فروقات بين الطلبات والعمليات المسجلة. (هذه مطابقة داخلية؛ قارن أيضاً مع كشف Paymob وحسابك البنكي.)</p>}
      </section>

      <section><h2 className="mb-3 text-xl font-bold text-navy-900">أداء الدورات</h2>
        <div className="overflow-x-auto rounded-lg border border-navy-900/15 bg-ivory-50"><table className="w-full min-w-[640px] text-sm">
          <thead className="bg-navy-900/5"><tr>{["الدورة", "التسجيلات", "نشطة", "مكتملون", "طلبات مدفوعة", "الإيراد", "مستردة"].map((h) => <th key={h} className="p-3 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-navy-900/10">{((perf.data ?? []) as any[]).map((r) => <tr key={r.course_id}><td className="p-3 font-semibold">{r.title}</td><td className="p-3">{r.enrollments}</td><td className="p-3">{r.active}</td><td className="p-3">{r.completed}</td><td className="p-3">{r.paid_orders}</td><td className="p-3">{egp(r.revenue_minor)}</td><td className="p-3">{r.refunded_orders}</td></tr>)}
            {!perf.data?.length && <tr><td colSpan={7} className="p-6 text-center text-ink/60">لا توجد دورات.</td></tr>}</tbody></table></div>
        <p className="mt-2 text-xs text-ink/60">الاسترداد من بوابة Paymob يتم من لوحتهم؛ عند وصول إشعار الاسترداد يُسحب الوصول تلقائياً ويظهر هنا. <Link href="/admin/audit-log?action=refund" className="underline">سجل الاستردادات</Link></p></section>
    </div>
  );
}
