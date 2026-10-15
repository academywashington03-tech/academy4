import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/course-validation";
import ReceiptForm from "@/components/ReceiptForm";

export const metadata = { title: "الدفع اليدوي | Manual payment", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function ManualPay({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!UUID_RE.test(orderId)) notFound();
  const s = await requirePath(`/checkout/manual/${orderId}`);
  const sb = await createClient();
  const { data: o } = await sb.from("orders").select("id, status, method, total_minor, currency, manual_reference, review_note, courses(title, slug), bundles(title)").eq("id", orderId).eq("user_id", s.id).maybeSingle();
  if (!o || o.method !== "manual") notFound();
  const { data: ms } = await sb.from("settings").select("value").eq("key", "public.manual_payments").maybeSingle();
  const instructions = ((ms?.value ?? {}) as { instructions?: string }).instructions ?? "";
  const title = (o as any).courses?.title ?? (o as any).bundles?.title;

  return (
    <div className="container-x max-w-xl space-y-5 py-10">
      <h1 className="text-3xl font-bold text-navy-900">الدفع بتحويل يدوي</h1>
      <div className="rounded-lg border border-navy-900/15 bg-ivory-50 p-5 text-sm">
        <p className="font-semibold text-navy-900">{title}</p>
        <p className="mt-1">المبلغ المطلوب: <span className="text-xl font-bold">{(o.total_minor / 100).toLocaleString("ar-EG")} {o.currency}</span></p>
        <p className="mt-1 text-xs text-ink/60">رقم الطلب: <span dir="ltr" className="font-mono">{o.id.slice(0, 8)}</span></p>
      </div>
      <section className="rounded-lg border border-gold-500/50 bg-gold-300/15 p-5">
        <h2 className="mb-2 font-bold text-navy-900">تعليمات الدفع</h2>
        <p className="whitespace-pre-wrap text-sm">{instructions || "لم تضبط الإدارة تعليمات الدفع بعد. تواصل معنا."}</p>
      </section>
      {o.status === "paid" ? <p className="rounded-md bg-emerald-100 p-3 text-emerald-900">تم اعتماد الدفع وتفعيل دورتك. <Link className="underline" href="/dashboard">لوحتي</Link></p>
        : o.status === "failed" ? <p role="alert" className="rounded-md bg-red-100 p-3 text-red-900">رُفض هذا الطلب{o.review_note ? `: ${o.review_note}` : ""}. يمكنك بدء طلب جديد من صفحة الدورة.</p>
        : (<>
            {o.status === "awaiting_review" && <p role="status" className="rounded-md bg-gold-300/30 p-3 text-sm">بياناتك قيد المراجعة (المرجع: <span dir="ltr">{o.manual_reference}</span>). يمكنك تحديثها أدناه.</p>}
            <section className="rounded-lg border border-navy-900/15 bg-ivory-50 p-5"><h2 className="mb-3 font-bold text-navy-900">بعد التحويل أرسل بياناتك</h2><ReceiptForm orderId={o.id} initialReference={o.manual_reference ?? ""} /></section>
          </>)}
      <p className="text-sm"><Link href="/orders" className="text-navy-700 underline">طلباتي</Link></p>
    </div>
  );
}
