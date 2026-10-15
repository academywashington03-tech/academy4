import Link from "next/link";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/course-validation";
import AutoRefresh from "@/components/AutoRefresh";

export const metadata = { title: "نتيجة الدفع | Payment result", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// DISPLAY ONLY. Paymob's redirect query string is ignored; the status shown comes from OUR database,
// which is changed only by the verified webhook (or an administrator).
export default async function Result({ searchParams }: { searchParams: Promise<{ o?: string }> }) {
  const sp = await searchParams;
  await requirePath("/checkout/result");
  const id = sp.o ?? "";
  const sb = await createClient();
  const { data: o } = UUID_RE.test(id) ? await sb.from("orders").select("status, fulfilled_at, courses(slug, title)").eq("id", id).maybeSingle() : { data: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const course = (o as any)?.courses as { slug: string; title: string } | null;

  let body: React.ReactNode;
  if (!o) body = <p>لم نجد هذا الطلب.</p>;
  else if (o.status === "paid" && o.fulfilled_at) body = (<><p className="text-xl font-bold text-emerald-800">تم تأكيد الدفع وتفعيل دورتك ✔</p>{course && <Link href={`/learn/${course.slug}`} className="btn btn-gold mt-4">ابدأ التعلّم</Link>}</>);
  else if (o.status === "failed" || o.status === "cancelled") body = (<><p className="text-xl font-bold text-red-800">لم تكتمل عملية الدفع</p><p className="mt-2 text-sm">لم يُفتح أي وصول. يمكنك المحاولة مرة أخرى.</p>{course && <Link href={`/checkout/${course.slug}`} className="btn btn-navy mt-4">إعادة المحاولة</Link>}</>);
  else if (o.status === "refunded") body = <p>تم استرداد هذا الطلب.</p>;
  else body = (<><AutoRefresh /><p className="text-xl font-bold text-navy-900">نتحقق من الدفع…</p><p className="mt-2 text-sm text-ink/70">قد يستغرق التأكيد دقائق. يمكنك إغلاق الصفحة؛ ستجد الدورة في لوحتك فور التأكيد.</p></>);

  return <div className="container-x max-w-xl py-14 text-center" aria-live="polite">{body}<p className="mt-8"><Link href="/orders" className="text-sm text-navy-700 underline">طلباتي</Link></p></div>;
}
