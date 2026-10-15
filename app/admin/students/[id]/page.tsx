import Link from "next/link";
import { notFound } from "next/navigation";
import { adminCtx } from "@/lib/admin-helpers";
import { UUID_RE } from "@/lib/course-validation";
import { Flash, fieldCls, cardCls } from "@/components/AdminUI";
import { grantAccess, revokeAccess, setSuspended } from "../../ops-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ST: Record<string, string> = { pending: "قيد الانتظار", awaiting_review: "بانتظار المراجعة", paid: "مدفوع", failed: "فشل", cancelled: "ملغى", refunded: "مُسترد" };

export default async function StudentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const { sb } = await adminCtx("/admin/students");
  const [{ data: p }, { data: enr }, { data: orders }, { data: courses }] = await Promise.all([
    sb.from("profiles").select("id, full_name, email, phone, role, suspended, created_at").eq("id", id).maybeSingle(),
    sb.from("enrollments").select("id, source, created_at, expires_at, revoked_at, courses(title)").eq("user_id", id).order("created_at", { ascending: false }),
    sb.from("orders").select("id, total_minor, currency, status, method, created_at, courses(title), bundles(title)").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    sb.from("courses").select("id, title").neq("status", "archived").order("title"),
  ]);
  if (!p) notFound();
  const now = new Date();
  return (
    <div className="container-x max-w-3xl space-y-6 py-8">
      <Link href="/admin/students" className="text-sm text-navy-700 underline">كل المستخدمين</Link>
      <div><h1 className="text-3xl font-bold text-navy-900">{p.full_name || "—"}</h1>
        <p className="text-sm text-ink/70"><span dir="ltr">{p.email}</span> · <span dir="ltr">{p.phone}</span> · {p.role}{p.suspended && <span className="text-red-800"> · موقوف</span>}</p></div>
      <Flash ok={sp.ok} error={sp.error} />

      <section className={`${cardCls} space-y-3`}>
        <h2 className="text-xl font-bold text-navy-900">منح وصول يدوي</h2>
        <form action={grantAccess} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="user_id" value={p.id} />
          <label className="text-sm font-medium sm:col-span-2">الدورة<select name="course_id" className={fieldCls}>{(courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
          <label className="text-sm font-medium">المدة بالأيام (فارغ = دائم)<input name="days" inputMode="numeric" dir="ltr" className={fieldCls} /></label>
          <label className="text-sm font-medium">السبب (للتدقيق)<input name="reason" className={fieldCls} /></label>
          <button className="btn btn-gold sm:col-span-2">منح الوصول</button>
        </form>
      </section>

      <section><h2 className="mb-2 text-xl font-bold text-navy-900">التسجيلات</h2>
        <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50 text-sm">
          {((enr ?? []) as any[]).map((e) => { const active = !e.revoked_at && (!e.expires_at || new Date(e.expires_at) > now);
            return (<li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><span><span className="font-semibold">{e.courses?.title}</span><br /><span className="text-xs text-ink/60">{e.source} · {new Date(e.created_at).toLocaleDateString("ar-EG")}{e.expires_at && ` · ينتهي ${new Date(e.expires_at).toLocaleDateString("ar-EG")}`}</span></span>
              {active ? <form action={revokeAccess} className="flex gap-2"><input type="hidden" name="user_id" value={p.id} /><input type="hidden" name="enrollment_id" value={e.id} /><input name="reason" placeholder="سبب السحب" className={`${fieldCls} mt-0`} /><button className="btn border border-red-700/40 px-3 text-red-800">سحب</button></form>
                : <span className="text-red-800">{e.revoked_at ? "مسحوب" : "منتهٍ"}</span>}</li>); })}
          {!enr?.length && <li className="p-4 text-ink/60">لا توجد تسجيلات.</li>}
        </ul></section>

      <section><h2 className="mb-2 text-xl font-bold text-navy-900">الطلبات</h2>
        <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50 text-sm">
          {((orders ?? []) as any[]).map((o) => <li key={o.id} className="flex justify-between gap-2 p-3"><span>{o.courses?.title ?? o.bundles?.title} · {o.method === "online" ? "إلكتروني" : "يدوي"}</span><span>{(o.total_minor / 100).toLocaleString("ar-EG")} {o.currency} · {ST[o.status]}</span></li>)}
          {!orders?.length && <li className="p-4 text-ink/60">لا توجد طلبات.</li>}
        </ul></section>

      {p.role !== "super_admin" && (
        <form action={setSuspended} className={`${cardCls} flex flex-wrap items-end gap-2`}>
          <input type="hidden" name="user_id" value={p.id} /><input type="hidden" name="flag" value={p.suspended ? "0" : "1"} />
          <label className="min-w-[200px] flex-1 text-sm font-medium">{p.suspended ? "سبب إعادة التفعيل" : "سبب الإيقاف"}<input name="reason" className={fieldCls} /></label>
          <button className={`btn ${p.suspended ? "btn-gold" : "border border-red-700/40 text-red-800"}`}>{p.suspended ? "إعادة تفعيل الحساب" : "إيقاف الحساب"}</button>
          <p className="w-full text-xs text-ink/60">الحساب الموقوف لا يستطيع فتح صفحات الطالب أو الإدارة. لا يُحذف أي سجل.</p>
        </form>
      )}
    </div>
  );
}
