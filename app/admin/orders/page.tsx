import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ST: Record<string, string> = { pending: "قيد الانتظار", awaiting_review: "بانتظار المراجعة", paid: "مدفوع", failed: "فشل", cancelled: "ملغى", refunded: "مُسترد" };

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function AdminOrders() {
  await requirePath("/admin/orders");     // super_admin only (instructors are blocked by the rules + RLS)
  const { data } = await (await createClient()).from("orders")
    .select("id, total_minor, currency, status, method, created_at, fulfilled_at, profiles!orders_user_id_fkey(full_name, email), courses(title), bundles(title), payment_transactions(provider_txn_id, outcome, success)")
    .order("created_at", { ascending: false }).limit(200);
  return (
    <div className="container-x py-8">
      <h1 className="mb-5 text-3xl font-bold text-navy-900">الطلبات والمدفوعات</h1>
      <div className="overflow-x-auto rounded-lg border border-navy-900/15 bg-ivory-50">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-navy-900/5 text-start"><tr>{["التاريخ", "الطالب", "الدورة", "المبلغ", "الحالة", "مرجع العملية"].map((h) => <th key={h} className="p-3 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-navy-900/10">
            {(data ?? []).map((o: any) => (
              <tr key={o.id}>
                <td className="p-3">{new Date(o.created_at).toLocaleDateString("ar-EG")}</td>
                <td className="p-3">{o.profiles?.full_name}<br /><span dir="ltr" className="text-xs text-ink/50">{o.profiles?.email}</span></td>
                <td className="p-3">{o.courses?.title ?? o.bundles?.title}</td>
                <td className="p-3">{(o.total_minor / 100).toLocaleString("ar-EG")} {o.currency}</td>
                <td className="p-3">{ST[o.status]}<br /><span className="text-xs text-ink/50">{o.method === "online" ? "إلكتروني" : "يدوي"}{o.fulfilled_at ? " · فُعِّل" : ""}</span></td>
                <td className="p-3 text-xs" dir="ltr">{(o.payment_transactions ?? []).map((t: any) => <div key={t.provider_txn_id}>{t.provider_txn_id} · {t.outcome ?? (t.success ? "ok" : "fail")}</div>)}</td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={6} className="p-6 text-center text-ink/60">لا توجد طلبات.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-ink/60">مراجعة الدفع اليدوي والاسترداد والتصدير تُضاف في المراحل 7 و9.</p>
    </div>
  );
}
