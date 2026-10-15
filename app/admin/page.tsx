import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Flash, cardCls } from "@/components/AdminUI";

type SP = Promise<{ error?: string }>;

export default async function AdminHome({ searchParams }: { searchParams: SP }) {
  const s = await requirePath("/admin");
  const sp = await searchParams;
  const sb = await createClient();
  const admin = s.role === "super_admin";
  const head = (t: string) => sb.from(t).select("*", { count: "exact", head: true });
  const [students, instructors, published, enrollments, recent, paid] = admin ? await Promise.all([
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "instructor"),
    sb.from("courses").select("id", { count: "exact", head: true }).eq("status", "published"),
    head("enrollments"),
    sb.from("profiles").select("full_name, email, created_at").order("created_at", { ascending: false }).limit(5),
    sb.from("orders").select("total_minor").eq("status", "paid"),
  ]) : [];
  const revenue = (paid?.data ?? []).reduce((a, o) => a + (o.total_minor as number), 0);
  const stats = admin ? [
    ["الطلاب", students?.count ?? 0], ["المدرّسون", instructors?.count ?? 0], ["دورات منشورة", published?.count ?? 0],
    ["الاشتراكات", enrollments?.count ?? 0], ["الإيرادات المؤكدة (ج.م)", (revenue / 100).toLocaleString("ar-EG")],
  ] : [];
  return (
    <div className="container-x py-8">
      <h1 className="mb-1 text-3xl font-bold text-navy-900">لوحة الإدارة</h1>
      <p className="mb-5 text-sm text-ink/60">{s.fullName}</p>
      <Flash error={sp.error} />
      {admin ? (
        <>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {stats.map(([k, v]) => <li key={String(k)} className={cardCls}><p className="text-sm text-ink/60">{k}</p><p className="mt-1 text-2xl font-bold text-navy-900">{v}</p></li>)}
          </ul>
          <section className="mt-8">
            <h2 className="mb-3 text-xl font-bold text-navy-900">أحدث التسجيلات</h2>
            <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50">
              {(recent?.data ?? []).map((r) => <li key={String(r.email) + String(r.created_at)} className="flex justify-between gap-3 p-3 text-sm"><span>{r.full_name}</span><span dir="ltr" className="text-ink/60">{r.email}</span></li>)}
              {!recent?.data?.length && <li className="p-3 text-sm text-ink/60">لا توجد تسجيلات بعد.</li>}
            </ul>
          </section>
          <p className="mt-6 text-sm text-ink/60">الطلبات والمدفوعات والتقارير تُضاف في المراحل 6 و7 و9.</p>
        </>
      ) : <p className="text-ink/70">اختر «الدورات» لإدارة الدورات المُسندة إليك.</p>}
    </div>
  );
}
