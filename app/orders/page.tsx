import Link from "next/link";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "طلباتي | My orders", robots: { index: false, follow: false } };
const ST: Record<string, string> = { pending: "قيد الانتظار", awaiting_review: "بانتظار المراجعة", paid: "مدفوع", failed: "فشل", cancelled: "ملغى", refunded: "مُسترد" };

export default async function Orders() {
  const s = await requirePath("/orders");
  const sb = await createClient();
  const { data: subs } = await sb.from("subscriptions").select("id, plan, status, current_period_end").eq("user_id", s.id);
  const { data: bnames } = subs?.length ? await sb.from("bundles").select("id, title, slug").in("id", subs.map((x) => x.plan)) : { data: [] };
  const { data } = await sb.from("orders").select("id, total_minor, currency, status, method, created_at, courses(title), bundles(title)").eq("user_id", s.id).order("created_at", { ascending: false }).limit(100);
  return (
    <div className="container-x max-w-3xl py-10">
      <Link href="/dashboard" className="text-sm text-navy-700 underline">لوحتي</Link>
      <h1 className="mb-5 mt-2 text-3xl font-bold text-navy-900">طلباتي</h1>
      {(subs?.length ?? 0) > 0 && (
        <section className="mb-8"><h2 className="mb-2 text-xl font-bold text-navy-900">اشتراكاتي</h2>
          <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50 text-sm">
            {subs!.map((x) => { const b = bnames?.find((n) => n.id === x.plan); const active = new Date(x.current_period_end) > new Date();
              return <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 p-4"><span className="font-semibold">{b?.title ?? "اشتراك"}</span>
                <span className={active ? "text-emerald-800" : "text-red-800"}>{active ? "نشط حتى" : "انتهى في"} {new Date(x.current_period_end).toLocaleDateString("ar-EG")}</span>
                {b && <Link href={`/bundles/${b.slug}`} className="btn border border-navy-900/30 px-3">{active ? "تمديد" : "تجديد"}</Link>}</li>; })}
          </ul></section>)}
      <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50">
        {(data ?? []).map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <span><span className="font-semibold text-navy-900">{(o as any).courses?.title ?? (o as any).bundles?.title ?? "—"}</span><br /><span className="text-ink/60">{new Date(o.created_at).toLocaleDateString("ar-EG")} · {o.method === "online" ? "دفع إلكتروني" : "دفع يدوي"}{o.method === "manual" && (o.status === "pending" || o.status === "awaiting_review") ? <> · <Link className="underline" href={`/checkout/manual/${o.id}`}>متابعة</Link></> : null}</span></span>
            <span className="text-end"><span className="font-semibold">{(o.total_minor / 100).toLocaleString("ar-EG")} {o.currency}</span><br /><span className={o.status === "paid" ? "text-emerald-800" : "text-ink/70"}>{ST[o.status]}</span></span>
          </li>
        ))}
        {!data?.length && <li className="p-6 text-center text-ink/60">لا توجد طلبات بعد.</li>}
      </ul>
    </div>
  );
}
