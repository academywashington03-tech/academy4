import Link from "next/link";
import { adminCtx } from "@/lib/admin-helpers";
import { UUID_RE } from "@/lib/course-validation";
import { fieldCls } from "@/components/AdminUI";

const PAGE = 50;
/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function AuditLog({ searchParams }: { searchParams: Promise<{ action?: string; actor?: string; p?: string }> }) {
  const { sb } = await adminCtx("/admin/audit-log"); const sp = await searchParams;
  const page = Math.max(1, Math.min(1000, Number(sp.p) || 1));
  let q = sb.from("audit_logs").select("id, action, entity, entity_id, details, created_at, profiles(full_name)", { count: "exact" }).order("id", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const action = (sp.action ?? "").replace(/[^a-z_]/g, "").slice(0, 60);
  if (action) q = q.ilike("action", `%${action}%`);
  if (sp.actor && UUID_RE.test(sp.actor)) q = q.eq("actor_id", sp.actor);
  const { data, count } = await q;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (n: number) => `?p=${n}${action ? `&action=${action}` : ""}${sp.actor ? `&actor=${sp.actor}` : ""}`;
  return (
    <div className="container-x py-8">
      <h1 className="mb-4 text-3xl font-bold text-navy-900">سجل التدقيق</h1>
      <form className="mb-4 flex flex-wrap gap-2"><input name="action" defaultValue={action} placeholder="نوع الإجراء (مثال: order, access)" dir="ltr" className={`${fieldCls} mt-0 max-w-sm`} />{sp.actor && <input type="hidden" name="actor" value={sp.actor} />}<button className="btn btn-navy">بحث</button>{sp.actor && <Link href="/admin/audit-log" className="btn border border-navy-900/30">إزالة تصفية المستخدم</Link>}</form>
      <div className="overflow-x-auto rounded-lg border border-navy-900/15 bg-ivory-50">
        <table className="w-full min-w-[720px] text-sm"><thead className="bg-navy-900/5"><tr>{["الوقت", "المنفّذ", "الإجراء", "الهدف", "تفاصيل"].map((h) => <th key={h} className="p-3 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-navy-900/10">
            {(data ?? []).map((r: any) => (
              <tr key={r.id}><td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString("ar-EG")}</td><td className="p-3">{r.profiles?.full_name ?? "النظام"}</td>
                <td className="p-3" dir="ltr">{r.action}</td><td className="p-3 text-xs" dir="ltr">{r.entity} {r.entity_id ? String(r.entity_id).slice(0, 13) : ""}</td>
                <td className="max-w-[260px] truncate p-3 text-xs text-ink/60" dir="ltr" title={r.details ? JSON.stringify(r.details) : ""}>{r.details ? JSON.stringify(r.details) : ""}</td></tr>
            ))}
            {!data?.length && <tr><td colSpan={5} className="p-6 text-center text-ink/60">لا توجد سجلات.</td></tr>}
          </tbody></table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm"><span>صفحة {page} من {pages} ({count ?? 0} سجل)</span>
        <span className="flex gap-2">{page > 1 && <Link className="btn border border-navy-900/30 px-3" href={qs(page - 1)}>السابق</Link>}{page < pages && <Link className="btn border border-navy-900/30 px-3" href={qs(page + 1)}>التالي</Link>}</span></div>
    </div>
  );
}
