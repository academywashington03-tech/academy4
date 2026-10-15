import Link from "next/link";
import { adminCtx } from "@/lib/admin-helpers";
import { fieldCls } from "@/components/AdminUI";

const PAGE = 25;
export default async function Students({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; p?: string }> }) {
  const { sb } = await adminCtx("/admin/students"); const sp = await searchParams;
  const page = Math.max(1, Math.min(2000, Number(sp.p) || 1));
  const term = (sp.q ?? "").replace(/[%_,()*\\]/g, " ").trim().slice(0, 60);
  let q = sb.from("profiles").select("id, full_name, email, phone, role, suspended, created_at", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  if (["student", "instructor", "super_admin"].includes(sp.role ?? "")) q = q.eq("role", sp.role!);
  const { data, count } = await q;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (n: number) => `?p=${n}${term ? `&q=${encodeURIComponent(term)}` : ""}${sp.role ? `&role=${sp.role}` : ""}`;
  return (
    <div className="container-x py-8">
      <h1 className="mb-4 text-3xl font-bold text-navy-900">الطلاب والمستخدمون</h1>
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input name="q" defaultValue={term} placeholder="بحث بالاسم أو البريد أو الهاتف" className={`${fieldCls} mt-0`} />
        <select name="role" defaultValue={sp.role ?? ""} className={`${fieldCls} mt-0`}><option value="">كل الأدوار</option><option value="student">طلاب</option><option value="instructor">مدرّسون</option><option value="super_admin">مديرون</option></select>
        <button className="btn btn-navy">بحث</button>
      </form>
      <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50">
        {(data ?? []).map((p) => (
          <li key={p.id}><Link href={`/admin/students/${p.id}`} className="flex min-h-[56px] flex-wrap items-center justify-between gap-2 p-3 hover:bg-gold-300/20">
            <span><span className="font-semibold text-navy-900">{p.full_name || "—"}</span><br /><span dir="ltr" className="text-xs text-ink/60">{p.email} · {p.phone}</span></span>
            <span className="text-xs text-ink/60">{p.role === "student" ? "طالب" : p.role === "instructor" ? "مدرّس" : "مدير"}{p.suspended && <span className="text-red-800"> · موقوف</span>}</span>
          </Link></li>
        ))}
        {!data?.length && <li className="p-6 text-center text-ink/60">لا توجد نتائج.</li>}
      </ul>
      <div className="mt-4 flex items-center justify-between text-sm"><span>صفحة {page} من {pages} ({count ?? 0})</span>
        <span className="flex gap-2">{page > 1 && <Link className="btn border border-navy-900/30 px-3" href={qs(page - 1)}>السابق</Link>}{page < pages && <Link className="btn border border-navy-900/30 px-3" href={qs(page + 1)}>التالي</Link>}</span></div>
    </div>
  );
}
