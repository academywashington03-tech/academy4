import { adminCtx } from "@/lib/admin-helpers";
import { Flash, fieldCls, cardCls } from "@/components/AdminUI";
import { approveManual, rejectManual } from "../commerce-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function ManualPayments({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { sb } = await adminCtx("/admin/manual-payments"); const sp = await searchParams;
  const { data } = await sb.from("orders")
    .select("id, total_minor, currency, status, created_at, manual_reference, manual_receipt_path, review_note, reviewed_at, profiles!orders_user_id_fkey(full_name, email, phone), courses(title), bundles(title)")
    .eq("method", "manual").in("status", ["awaiting_review", "paid", "failed"]).order("created_at", { ascending: false }).limit(100);
  const rows = await Promise.all(((data ?? []) as any[]).map(async (o) => {
    let receipt: string | null = null;
    if (o.manual_receipt_path) receipt = (await sb.storage.from("payment-receipts").createSignedUrl(o.manual_receipt_path, 300)).data?.signedUrl ?? null;
    return { ...o, receipt };
  }));
  const pending = rows.filter((r) => r.status === "awaiting_review"); const done = rows.filter((r) => r.status !== "awaiting_review");
  return (
    <div className="container-x max-w-3xl space-y-6 py-8">
      <h1 className="text-3xl font-bold text-navy-900">مراجعة الدفع اليدوي</h1>
      <p className="text-sm text-ink/70">هذه المدفوعات تُعتمد بقرار منك بعد مطابقة التحويل في حسابك. هي ليست «دفعاً إلكترونياً مؤكداً» وتُسجَّل كذلك في سجل التدقيق.</p>
      <Flash ok={sp.ok} error={sp.error} />
      {pending.length === 0 && <p className="rounded-lg border border-dashed border-navy-900/30 p-6 text-center text-ink/60">لا توجد طلبات بانتظار المراجعة.</p>}
      {pending.map((o) => (
        <div key={o.id} className={`${cardCls} space-y-3 text-sm`}>
          <p className="font-semibold text-navy-900">{o.courses?.title ?? o.bundles?.title} — {(o.total_minor / 100).toLocaleString("ar-EG")} {o.currency}</p>
          <p>{o.profiles?.full_name} · <span dir="ltr">{o.profiles?.phone}</span> · <span dir="ltr">{o.profiles?.email}</span></p>
          <p>المرجع الذي كتبه الطالب: <span dir="ltr" className="font-mono">{o.manual_reference}</span></p>
          <p>{o.receipt ? <a href={o.receipt} target="_blank" rel="noopener noreferrer" className="underline">عرض الإيصال (رابط مؤقت لـ 5 دقائق)</a> : "لا يوجد إيصال مرفق"}</p>
          <div className="flex flex-wrap items-end gap-2">
            <form action={approveManual}><input type="hidden" name="id" value={o.id} /><button className="btn btn-gold">اعتماد وتفعيل</button></form>
            <form action={rejectManual} className="flex flex-1 gap-2"><input type="hidden" name="id" value={o.id} /><input name="reason" placeholder="سبب الرفض" className={`${fieldCls} mt-0`} /><button className="btn border border-red-700/40 text-red-800">رفض</button></form>
          </div>
        </div>
      ))}
      {done.length > 0 && (<section><h2 className="mb-2 text-xl font-bold text-navy-900">آخر القرارات</h2>
        <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50 text-sm">
          {done.map((o) => <li key={o.id} className="flex justify-between gap-2 p-3"><span>{o.courses?.title ?? o.bundles?.title} · {o.profiles?.full_name}</span><span className={o.status === "paid" ? "text-emerald-800" : "text-red-800"}>{o.status === "paid" ? "معتمد" : `مرفوض${o.review_note ? `: ${o.review_note}` : ""}`}</span></li>)}
        </ul></section>)}
    </div>
  );
}
