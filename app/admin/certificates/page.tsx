import { adminCtx } from "@/lib/admin-helpers";
import { Flash, fieldCls } from "@/components/AdminUI";
import { revokeCertificate } from "../cert-actions";

export default async function AdminCertificates({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { sb } = await adminCtx("/admin/certificates"); const sp = await searchParams;
  const { data } = await sb.from("certificates").select("id, certificate_no, student_name, course_title, issued_at, revoked_at").order("issued_at", { ascending: false }).limit(200);
  return (
    <div className="container-x max-w-4xl space-y-5 py-8">
      <h1 className="text-3xl font-bold text-navy-900">الشهادات الصادرة</h1>
      <p className="text-sm text-ink/70">تُصدر الشهادة تلقائياً عند استيفاء شروط الدورة (الدروس المطلوبة + الاختبارات المطلوبة). شروط كل دورة تضبطها من صفحة تعديل الدورة (تمنح شهادة / درجة النجاح) ومن إعدادات كل درس واختبار.</p>
      <Flash ok={sp.ok} error={sp.error} />
      <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50 text-sm">
        {(data ?? []).map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span><span className="font-semibold">{c.student_name}</span> — {c.course_title}<br /><span dir="ltr" className="font-mono text-xs text-ink/60">{c.certificate_no}</span> · {new Date(c.issued_at).toLocaleDateString("ar-EG")}{c.revoked_at && <span className="text-red-800"> · ملغاة</span>}</span>
            {!c.revoked_at && <form action={revokeCertificate} className="flex gap-2"><input type="hidden" name="id" value={c.id} /><input name="reason" placeholder="سبب الإلغاء" className={`${fieldCls} mt-0`} /><button className="btn border border-red-700/40 px-3 text-red-800">إلغاء</button></form>}
          </li>
        ))}
        {!data?.length && <li className="p-6 text-center text-ink/60">لا توجد شهادات بعد.</li>}
      </ul>
    </div>
  );
}
